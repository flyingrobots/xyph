export interface ReadIdentity {
  readonly accessorId: string;
  readonly role: 'agent' | 'human';
}

export interface BoundedRead<T> {
  readonly value: T;
  readonly completeness: 'complete' | 'truncated';
  readonly cursor: string | null;
  readonly readIdentity: ReadIdentity;
}
