import type { InvariantCode } from "./InvariantCode.js";

export interface InvariantError {
  code: InvariantCode | string;
  message: string;
}
