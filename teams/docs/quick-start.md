# 快速启动

需要 Node.js 24、npm 和 Git。进入 teams 目录：

```sh
npm ci
npm run dev
```

Teams：http://127.0.0.1:45970/teams。Ctrl+C 停止。状态保存在忽略目录 .runtime，重启保留。Talents 是独立项目（仓库根目录的 talents/，http://127.0.0.1:45980/talents），两者通过共享数据目录 shared/data 交换数据；在仓库根目录执行 `npm run dev` 可同时启动两边。


Windows 可运行仓库 start-demo.cmd；macOS 可运行仓库启动/停止 command 文件。原生工具可选，不是网页运行的前提。未设置 `DEMO_ICODE_BINARY` 时会依次查找官方安装位置（Windows `%LOCALAPPDATA%\chrys\bin\icode.exe`，macOS/Linux `~/.local/bin/icode`）、uv / pipx 安装回执记录的入口、PATH 中的 `icode` / `chrys`，最后是仓库开发包；每个候选都要实际回答 `--version` 才算命中，装坏的一个不会挡住下一个。显式路径仍优先且失败即报错，不会退到其他安装。原生 Python 按选中的安装推导：启动器同目录、uv / pipx 的工具环境，再到 pyapp 运行时缓存，并用同一版本号校验。Agent 管理的「引擎定位」展示原生入口、版本、配置目录与会话根。配置自己的可执行文件时使用 DEMO_ICODE_BINARY 或 DEMO_OPENCODE_BINARY，不在仓库提交密钥。

## 操作顺序

Owner 在项目概览关联资产，在任务管理中分配需求。进入任务交付页后，Teams 按项目、任务和当前节点筛选共享目录中 Talents 写入的知识（没有时为空，不阻止准备）与真实版本 Skill 包；页面与 CLI 读取同一结果，采用前属于建议输入。任务按“我的任务 / 其他任务”分组，项目内可共同浏览，仅当前交付人可执行，Owner 也可承担任务；MKT-001 与新增交付需求共用需求澄清、功能开发、测试验证、需求验收四节点，按输入、结果、执行过程展示；结果列出本节点交付物和完成标准。iCode 通过 Teams CLI 明确采用输入后，提交 PRD 与澄清完成标准，再进入开发。设计、代码 PR／提交、单测和功能／检视／安全报告使用可追踪的产物引用与代码版本；上游引用在下游原样复用。开发、检查结果和进度也只由 CLI 回传；页面切换节点不推进状态。执行过程上部是 CLI 主动回传的业务进展，下部按真实用户轮次只读刷新已保存的用户输入与模型可见回复，不展示隐藏思考、Hook 或工具流水；会话活动不自动变成业务进度。预置检查明确标注来源，同批任一失败都不能提交验收，Owner 退回后必须重新检查。Owner 验收通过后，Teams 自动归集前面节点关联的一个或多个会话，写入共享目录 `shared/data/teams/task-sessions`；页面分别展示验收状态和共享回执。Talents 消费这些会话的分析链路尚未接入；共享成功不表示已分析，不作为本次任务完成条件。Talents 只对 Owner 开放：远端索引等产物写入共享目录，Teams 在项目知识中展示；文件类知识和改进建议由 Talents 以 PR 提交到代码仓。

UI 沿产品页面操作，不会发生真实支付。用户确认独立需求的 iCode 作业后，将使用所选终端打开本机 iCode TUI；输入工作指令时附带当前节点上下文入口，由开发者决定交互和是否继续后续节点。不会自动串行完成整项需求；普通页面访问及仅打开 TUI 不会提交模型任务。检查记录区分实际执行与预置结果，生产安全状态未验证。

## 验证命令

```sh
npm run typecheck
npm test
npm run build
npm run test:http
```

浏览器脚本需要额外 Chrome 运行环境；只有实际执行的检查才可声明通过。工作区旧状态与当前活动冲突时，由 Owner 使用重置工作区重新开始；不会重写源码或原生会话。

## CLI

```sh
node scripts/teams-demo.mjs --help
node scripts/teams-demo.mjs context get --project carddemo --task DEMO-MKT-001 --node prepare
```

CLI 仅连接明确的本机服务，并要求项目、任务和节点上下文。

## 本机持久配置

在同一 Git 仓库的 `teams` 中开发与运行：`npm run dev` 用于前台运行，`npm run launch` / `npm run stop` 用于后台启停，并核对当前目录的服务归属。新作业和 Skill 源文件默认来自该仓库的 `workspace`，不依赖另一份应用副本。

本机配置放在被 Git 忽略的 `teams/.local/config.json`，启动、停止、服务和 Teams CLI 共用；显式 shell 环境变量优先。默认文件缺失使用原默认值；显式指定的文件缺失、损坏 JSON、未知键和错误类型直接报错。路径键 `DEMO_MATERIAL_ROOT`、`DEMO_STATE_DIR`、`DEMO_SHARED_DIR`（共享数据目录，默认 ../shared/data）、`DEMO_ICODE_BINARY`、`DEMO_ICODE_PYTHON`、`DEMO_OPENCODE_BINARY` 均须为绝对路径；端口键 `DEMO_PORT`、`DEMO_TALENT_PORT` 须为 1024–65535 的 JSON 整数。绝对路径环境变量 `DEMO_LOCAL_CONFIG` 可选择独立配置文件，用于隔离运行与测试。

Teams 状态可放在 `.local/state/teams`。独立 Talents 使用自己的 `.runtime` 或配置目录；旧 Talent 的状态与回执原样保留，不能直接交给新 Talents Store。Teams CLI 默认回执随 Teams 状态目录保存。iCode 与其 Python 可指向仓库外的安装位置。不要把整个材料根目录指向旧运行副本。当前产品仅提供新作业入口；原生历史会话保持原位置，迁移备份仅保存在本机；不会自动迁移或重写。

旧 MKT-001 数据在启动时执行一次明确迁移：先将原状态逐字节备份到同目录的 `state.json.pre-unified-delivery.json`，再建立保留原任务 ID 的统一交付记录。旧顶层状态、上下文、交易和会话证据保持原样，历史预置结果不会被标为新的 iCode 执行。后续启动不重复迁移。

## iCode TUI 与任务会话

Windows 与 macOS 均以可交互 TUI 启动，沿用 Agent 管理中的终端及本机 Agent/模型配置。当前节点上下文通过两条仅在 Teams 作业进程中生效的原生 Hook 带入；安装前备份已有 Hooks，保留其他规则。首次输入后仍须由 iCode 读取并通过 Teams CLI 明确采用，打开终端不等于已读取或已完成。`icode run --task ... --json` 仅保留为显式自动验证工具，不是页面默认启动方式。

Teams 启动的 iCode 作业关闭 OTLP Trace，不依赖 Trace 接收器或 exporter。任务状态仍通过 Teams CLI 回传；「任务追溯 → 任务会话」和交付节点的执行过程读取本机原生会话文件，展示用户输入与模型回复。关闭 Trace 不影响会话保存、恢复和验收后会话归集。此设置在新进程中生效，已运行的 iCode 会话需要退出后重新进入；历史 Trace 文件保留。

Owner 验收时，无需关闭仍在使用的 TUI：Teams 核验该任务的原生会话归属，固定当时已落盘正文及摘要，重试使用同一快照。会话后续交互不会改变这次验收上报；验收结论、TUI 退出状态与 共享导出状态分别记录。
