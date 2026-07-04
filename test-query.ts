import { WarpCore } from '@git-stunts/git-warp';
type W = WarpCore;
type Q = ReturnType<W['worldline']>;
type Keys = keyof Q;
// We can intentionally create an error to see the keys
const x: Keys = "XYZ";
