export interface RecordCommentCommand {
  readonly id?: string;
  readonly targetId: string;
  readonly message: string;
  readonly replyTo?: string;
  readonly authoredBy: string;
  readonly idempotencyKey?: string;
}

export interface RecordCommentResult {
  readonly id: string;
  readonly targetId: string;
  readonly replyTo?: string;
  readonly patch: string;
  readonly authoredAt: number;
  readonly contentOid: string | null;
}

export interface RecordCommentIntentPort {
  recordComment(command: RecordCommentCommand): Promise<RecordCommentResult>;
}
