# 任务工作目录与本地 Git 回退

Teams 优先使用项目工作区创建的独立任务 worktree。没有项目工作区、项目仓库地址无效或任务还没有目录时，任务交付页的「配置工作目录」会使用任务级回退，避免准备节点被目录条件直接卡住。

## 三种模式

| 模式 | 何时使用 | 允许的交付证据 |
| --- | --- | --- |
| 项目 worktree | 项目概览已配置独立 Git 仓库和工作树 | commit/PR/codeVersion 按现有合同 |
| 本地 Git | 目录已有 `.git`，或没有 `.git` 时自动初始化 | 本地 commit/codeVersion；`localOnly` 时禁止推送/远程 PR |
| 普通目录 | 用户明确选择“不使用 Git”，或 Git 初始化失败 | 文件快照/说明；不可声称 commit、codeVersion 或 PR |

## 自动初始化规则

- 目录已有 `.git`：直接使用；如果 origin 与项目登记一致，则不是 local-only。
- 目录没有 `.git`：执行 `git init`，切到 `main`，创建一个**空初始提交**；不自动提交目录中已有的文件。
- 项目登记了合法 HTTPS/SSH remote：把 origin 设为该地址；否则保持 local-only。
- 目录位于 Teams 工程内部：拒绝，避免修改应用工程本身。
- Git 不可用或初始化失败：登记为普通目录，准备节点仍可继续；后续 develop 的 codeVersion 门禁可能要求 blocked。

## 生命周期

- 任务级工作区记录在 `teams/.runtime/task-workspaces.json`，只按 `projectId/taskId` 查找。
- 已有准备会话后，不再允许更换工作目录；需要换目录时先重置/重建任务。
- 已有项目 worktree 的任务优先使用原 worktree，不会被任务级目录覆盖。
- 已有显式 `workDirectory` 的任务不会使用任务级回退。

## 提示与限制

- local-only 任务在页面显示“本地 Git · 未配置远程”；启动材料明确禁止推送、创建远程 PR 或声称远程交付完成。
- 普通目录任务的启动材料明确禁止声称 commit/codeVersion/PR；如节点门禁要求 codeVersion，应回传 blocked。
- 准备节点本身不依赖代码版本，因此在上述模式下都可以完成；开发/验证节点的证据要求仍按任务节点合同执行。
