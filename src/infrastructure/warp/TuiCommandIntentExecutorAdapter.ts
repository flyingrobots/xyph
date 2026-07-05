import type {
  CommandIntentExecutionOutcome,
  CommandIntentExecutionInput,
  CommandIntentExecutorPort,
} from '../../ports/CommandIntentExecutorPort.js';

export class TuiCommandIntentExecutorAdapter implements CommandIntentExecutorPort {
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

    const result = await input.run();
    return {
      admitted: true,
      sha: typeof result === 'string' ? result : '',
      intentId: input.descriptor.intentId,
    };
  }
}
