import type { RecordCommentIntentPort } from '../../ports/RecordCommentIntentPort.js';
import type {
  WritingReceipt,
  XYPHWriter,
  XYPHWriting,
  XYPHWritingValue,
} from '../../ports/XYPHWriter.js';
import {
  isRecordCommentWriting,
  type RecordedComment,
} from '../../writings/RecordComment.js';

export class WarpXYPHWriterAdapter implements XYPHWriter {
  constructor(private readonly recordCommentIntent: RecordCommentIntentPort) {}

  public async write<W extends XYPHWriting<string, unknown, unknown>>(
    writing: W,
  ): Promise<WritingReceipt<XYPHWritingValue<W>>> {
    if (isRecordCommentWriting(writing)) {
      const result = await this.recordCommentIntent.recordComment(writing.input);
      const receipt: WritingReceipt<RecordedComment> = {
        value: {
          id: result.id,
          targetId: result.targetId,
          ...(result.replyTo === undefined ? {} : { replyTo: result.replyTo }),
          authoredAt: result.authoredAt,
          contentOid: result.contentOid,
        },
        writing: writing.kind,
        recordedBy: writing.input.authoredBy,
        recordedAt: result.authoredAt,
        witness: {
          id: result.id,
          patch: result.patch,
        },
      };
      return receipt as WritingReceipt<XYPHWritingValue<W>>;
    }

    throw new Error(`[UNSUPPORTED_WRITING] ${writing.kind}`);
  }
}
