declare module '@git-stunts/plumbing' {
  export interface GitPlumbing {
    readonly emptyTree: string;
    execute(options: { args: string[]; input?: string | Buffer }): Promise<string>;
    executeStream(options: { args: string[] }): Promise<any>;
  }
  
  export interface ShellRunnerFactory {
    static create(options?: { env?: string }): any;
  }

  const Plumbing: {
    new (options: { cwd: string; runner?: any }): GitPlumbing;
    createDefault(options: { cwd: string }): GitPlumbing;
  };
  
  export default Plumbing;
}
