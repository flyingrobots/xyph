import type { OpticDomainActionService } from '../../domain/services/OpticDomainActionService.js';
import type {
  CommandIntentExecutionOutcome,
  CommandIntentExecutionInput,
  CommandIntentExecutorPort,
} from '../../ports/CommandIntentExecutorPort.js';

export class TuiCommandIntentExecutorAdapter implements CommandIntentExecutorPort {
  constructor(
    private readonly opticDomainActionService?: Pick<OpticDomainActionService, 'executeAction'>,
  ) {}

  public async execute(input: CommandIntentExecutionInput): Promise<CommandIntentExecutionOutcome> {
    const actualOperation = input.descriptor.suffixTransform?.op;
    if (actualOperation !== input.expectedOperation) {
      return {
        admitted: false,
        obstruction: {
          tag: 'IntentOperationMismatch',
          actual: actualOperation ?? 'missing-op',
        },
        intentId: input.descriptor.intentId,
      };
    }

    if (input.expectedOperation === 'claimQuest') {
      if (!this.opticDomainActionService) {
        return {
          admitted: false,
          obstruction: {
            tag: 'OpticDomainActionServiceMissing',
            actual: 'missing-service',
          },
          intentId: input.descriptor.intentId,
        };
      }
      return await this.opticDomainActionService.executeAction({}, input.intent);
    }

    const result = await input.run();
    return {
      admitted: true,
      sha: typeof result === 'string' ? result : '',
      intentId: input.descriptor.intentId,
    };
  }
}
