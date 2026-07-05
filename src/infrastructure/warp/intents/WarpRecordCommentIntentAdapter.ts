import { createHash, randomUUID } from 'node:crypto';
import type { ClockPort } from '../../../ports/ClockPort.js';
import type { GraphPort } from '../../../ports/GraphPort.js';
import type {
  RecordCommentCommand,
  RecordCommentIntentPort,
  RecordCommentResult,
} from '../../../ports/RecordCommentIntentPort.js';
import { SystemClockAdapter } from '../../adapters/SystemClockAdapter.js';
import { MutationKernelService } from '../../../domain/services/MutationKernelService.js';
import { WarpCausalMutationAdapter } from '../CausalMutationAdapter.js';
import { contentOidFromProps } from '../../ObservedGraphProjection.js';

function deriveId(prefix: string, explicitId: string | undefined, idempotencyKey: string | undefined, clock: ClockPort): string {
  if (explicitId) return explicitId;
  if (idempotencyKey) {
    const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16);
    return `${prefix}${digest}`;
  }
  const ts = clock.now().toString(36);
  return `${prefix}${ts}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export class WarpRecordCommentIntentAdapter implements RecordCommentIntentPort {
  private readonly kernel: MutationKernelService;
  private readonly clock: ClockPort;

  constructor(
    private readonly graphPort: GraphPort,
    clock?: ClockPort,
    kernel?: MutationKernelService,
  ) {
    this.clock = clock ?? new SystemClockAdapter();
    this.kernel = kernel ?? new MutationKernelService(new WarpCausalMutationAdapter(graphPort));
  }

  async recordComment(command: RecordCommentCommand): Promise<RecordCommentResult> {
    const message = command.message.trim();
    if (message.length === 0) {
      throw new Error('[INVALID_INPUT] Comment message is required');
    }

    const graph = await (this.graphPort.getMutationGraph?.() ?? this.graphPort.getGraph());
    if (!await graph.worldline().hasNode(command.targetId)) {
      throw new Error(`[NOT_FOUND] Target ${command.targetId} not found`);
    }
    if (command.replyTo && !await graph.worldline().hasNode(command.replyTo)) {
      throw new Error(`[NOT_FOUND] Reply target ${command.replyTo} not found`);
    }

    const id = deriveId('comment:', command.id, command.idempotencyKey, this.clock);
    const authoredAt = this.clock.now();
    const result = await this.kernel.execute({
      idempotencyKey: command.idempotencyKey,
      rationale: 'Record append-only comment intent.',
      ops: [
        { op: 'add_node', nodeId: id },
        { op: 'set_node_property', nodeId: id, key: 'type', value: 'comment' },
        { op: 'set_node_property', nodeId: id, key: 'authored_by', value: command.authoredBy },
        { op: 'set_node_property', nodeId: id, key: 'authored_at', value: authoredAt },
        { op: 'add_edge', from: id, to: command.targetId, label: 'comments-on' },
        ...(command.replyTo ? [{ op: 'add_edge', from: id, to: command.replyTo, label: 'replies-to' } as const] : []),
        { op: 'attach_node_content', nodeId: id, content: message },
      ],
    });

    if (!result.executed || !result.patch) {
      const reasons = result.reasons.length > 0 ? `: ${result.reasons.join('; ')}` : '';
      const code = result.code ?? 'unknown';
      throw new Error(`[INVALID_STATE] Failed to record comment ${id} (${code})${reasons}`);
    }

    return {
      id,
      targetId: command.targetId,
      ...(command.replyTo === undefined ? {} : { replyTo: command.replyTo }),
      patch: result.patch,
      authoredAt,
      contentOid: await graph.worldline().getNodeProps(id).then(contentOidFromProps),
    };
  }
}
