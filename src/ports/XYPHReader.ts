export interface XYPHReading<Name extends string, Input, Value> {
  readonly kind: Name;
  readonly input: Input;
  readonly __value?: Value;
}

export type XYPHReadingValue<R> =
  R extends XYPHReading<string, unknown, infer Value> ? Value : never;

export interface ReadingCoordinate {
  readonly basis: 'current' | 'settled' | 'pinned';
  readonly id?: string;
}

export interface ReadingFrame<Value> {
  readonly value: Value;
  readonly reading: string;
  readonly readAt: number;
  readonly coordinate: ReadingCoordinate;
}

export interface XYPHReader {
  read<R extends XYPHReading<string, unknown, unknown>>(
    reading: R,
  ): Promise<ReadingFrame<XYPHReadingValue<R>>>;
}
