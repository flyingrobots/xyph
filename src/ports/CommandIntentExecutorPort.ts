export interface CommandIntentDescriptor {
  readonly intentId: string;
  readonly suffixTransform?: {
    readonly op?: string;
    readonly payload?: Record<string, unknown>;
  };
}

export interface CommandIntentExecutionInput {
  readonly descriptor: CommandIntentDescriptor;
  readonly expectedOperation: string;
  readonly intent: Record<string, unknown>;
  readonly run: () => Promise<unknown>;
}

export interface CommandIntentExecutionOutcome {
  readonly admitted: boolean;
  readonly sha?: string;
  readonly intentId: string;
  readonly obstruction?: {
    readonly tag: string;
    readonly actual: string;
  };
}

export interface CommandIntentExecutorPort {
  execute(input: CommandIntentExecutionInput): Promise<CommandIntentExecutionOutcome>;
}
