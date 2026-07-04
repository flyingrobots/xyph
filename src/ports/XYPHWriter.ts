export interface XYPHWriting<Name extends string, Input, Value> {
  readonly kind: Name;
  readonly input: Input;
  readonly __value?: Value;
}

export type XYPHWritingValue<W> =
  W extends XYPHWriting<string, unknown, infer Value> ? Value : never;

export interface WritingWitness {
  readonly id: string;
  readonly patch: string | null;
}

export interface WritingReceipt<Value> {
  readonly value: Value;
  readonly writing: string;
  readonly recordedBy: string;
  readonly recordedAt: number;
  readonly witness: WritingWitness;
}

export interface XYPHWriter {
  write<W extends XYPHWriting<string, unknown, unknown>>(
    writing: W,
  ): Promise<WritingReceipt<XYPHWritingValue<W>>>;
}
