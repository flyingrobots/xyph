import type { XYPHWriting } from '../ports/XYPHWriter.js';

export const RECORD_COMMENT_WRITING = 'xyph.write.recordComment';

export interface RecordCommentInput {
  readonly id?: string;
  readonly targetId: string;
  readonly message: string;
  readonly replyTo?: string;
  readonly authoredBy: string;
  readonly idempotencyKey?: string;
}

export interface RecordedComment {
  readonly id: string;
  readonly targetId: string;
  readonly replyTo?: string;
  readonly authoredAt: number;
  readonly contentOid: string | null;
}

export type RecordCommentWriting = XYPHWriting<
  typeof RECORD_COMMENT_WRITING,
  RecordCommentInput,
  RecordedComment
>;

export function RecordComment(input: RecordCommentInput): RecordCommentWriting {
  return {
    kind: RECORD_COMMENT_WRITING,
    input,
  };
}

export function isRecordCommentWriting(
  writing: XYPHWriting<string, unknown, unknown>,
): writing is RecordCommentWriting {
  return writing.kind === RECORD_COMMENT_WRITING;
}
