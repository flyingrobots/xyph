declare module '@git-stunts/plumbing' {
  export interface GitPlumbing {
    readonly emptyTree: string;
    execute(options: { args: string[]; input?: string | Buffer }): Promise<string>;
    executeStream(options: { args: string[] }): Promise<unknown>;
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
