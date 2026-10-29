/** A task-local workspace fallback when no verified project worktree exists. */
export type TaskWorkspaceMode = 'git' | 'directory';
export interface TaskWorkspace {
  projectId: string;
  taskId: string;
  mode: TaskWorkspaceMode;
  directory: string;
  /** True when there is no verified remote for push/PR delivery. */
  localOnly: boolean;
  remoteUrl: string | null;
  baseBranch: string | null;
  baseCommit: string | null;
  createdAt: string;
  note: string;
}
