/** Device-local execution configuration; never part of shared business state. */
export interface ProjectWorkspace {
  projectId: string;
  directory: string;
  remoteUrl: string;
  baseBranch: string;
  commonDirectory: string;
}
export interface ProjectWorkspaces {
  version: 1;
  defaultProjectId: string | null;
  projects: ProjectWorkspace[];
}
export interface ProjectTaskWorktree extends ProjectWorkspace {
  kind: 'project-worktree';
  remote: 'origin';
  taskId: string;
  recordedDirectory: string | null;
  worktreeRoot: string;
  branch: string;
  baseCommit: string;
  repositoryDirectory: string;
}
