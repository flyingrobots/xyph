declare module '@git-stunts/vault' {
  export function get(key: string): Promise<string | undefined>;
  export function set(key: string, value: string): Promise<void>;
  export function remove(key: string): Promise<void>;
}

declare module '@git-stunts/plumbing' {
  interface StreamResult extends AsyncIterable<Uint8Array> {
    collect(opts?: { asString?: boolean }): Promise<string | Buffer>;
  }

  export interface GitPlumbing {
    readonly emptyTree: string;
    execute(options: { args: string[]; input?: string | Buffer }): Promise<string>;
    executeStream(options: { args: string[] }): Promise<StreamResult>;
  }

  export const ShellRunnerFactory: {
    create(options?: { env?: string }): unknown;
  };

  const Plumbing: {
    new (options: { cwd: string; runner?: unknown }): GitPlumbing;
    createDefault(options: { cwd: string }): GitPlumbing;
  };

  export default Plumbing;
}
