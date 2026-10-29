# Teams × iCode × Talents

两个独立启动的演示项目，通过共享数据目录交换数据：

| 项目 | 目录 | 地址 | 负责 |
|---|---|---|---|
| iCode Teams | `teams/` | http://127.0.0.1:45970/teams | 团队协作：项目、需求、交付、验收、会话共享 |
| iCode Talents | `talents/` | http://127.0.0.1:45980/talents | 知识挖掘（Owner）：来源、知识任务、产物审阅、提交知识与改进 PR |

演示需求：信用卡消费返现，针对白金卡客户未来 3 个月的消费，额外增加 0.5% 的消费返现（DEMO-MKT-001，项目「Credit Card」）。

## 启动

安装 Node.js 24 与 Git：

```sh
git clone https://github.com/zhuyuloveai/teams-talent-demo.git
cd teams-talent-demo
npm run setup      # Teams 与 Talents 各自 npm ci
npm run dev        # 构建并同时启动两边，Ctrl+C 一起停止
```

- 后台启停：`npm start` / `npm stop`（macOS 也可双击 `启动演示.command` / `停止演示.command`，Windows 用 `start-demo.cmd`）。
- 单独启动：`cd teams && npm run dev`，或 `cd talents && npm run dev`。另一边没启动时，读取 `shared/seed/` 中提交的初始数据。

任务追溯保留 CLI 进度与原生会话正文。Teams 启动的 iCode 不再启用 OTLP Trace，无需安装 Trace 服务或 exporter。

服务仅监听本机。Teams 的配置见 [快速启动](teams/docs/quick-start.md)，Talents 见 [talents/README.md](talents/README.md)。

## 四需求预置资料

新 checkout 执行 `npm run setup`、`npm start`（或前台 `npm run dev`）后，Talents 的 Credit Card 项目产物列表和 Teams 的「项目知识」可查看以下四份模拟需求的 v1、v2 发布资料。每版包含完整原文、测试口径、业务规则、差异、实现约束、验收定义和来源摘要；Teams 按节点加载仓内真实 Skill 包。原始需求与本地测试口径是演示输入，不是生产政策签字，也不代表任何业务功能或测试已经完成。

| 业务编号 | 新建需求标题（精确匹配） |
|---|---|
| REQ-2026-001 | 信用卡账单/消费分期 |
| REQ-2026-002 | 信用卡挂失与补卡 |
| REQ-2026-003 | 信用卡额度调整申请与审批 |
| REQ-2026-004 | 交易争议在线申请与处理 |

在 Teams 的 Credit Card 项目进入「任务管理 → 需求 → 新建需求」，分别填写下方标题和完整背景。以下统一选择 v2 资料；背景代码块中的业务编号、原文 SHA256、口径版本及 SHA256 均须保留，才能匹配对应知识、Skill 和测试用例。运行时任务 ID 由 Teams 自动创建。

### REQ-2026-001

**需求标题：** 信用卡账单/消费分期

**需求背景（完整复制到新建需求的描述中）：**

```text
业务背景：持卡人需要将单笔已入账消费或账单中的可分期金额分摊到后续月份，降低当期还款压力。提供 3、6、12 期试算与申请、分期和还款计划查询、提前结清，以及客服查询与协助处理；对接交易、账户、账单、总账、通知与审计，保持额度占用、费用与账务一致。

业务需求编号：REQ-2026-001
原始需求 SHA256：6d6a04c8b7e5b87a17429b0125f9485ee11a96d370e2e90944f309774e479e13
完整需求：Talents发布资料 four-requirements/REQ-2026-001/原始需求.md（原文v1.0）。
范围：信用卡账单/消费分期，必须读取完整原文全部13章后开展；当前任务摘要不缩减功能、接口、数据、安全与验收范围。第5章明确模拟值用于本次测试；第12.3事项保留投产待确认，内部矛盾按资料差异清单澄清，不伪造Owner确认。
试验口径版本：test-profile-v2
试验口径 SHA256：b77c194258178a08ffd90beccb5e0f038472e69615655440bdc2493b2b3813cd
本任务明确锁定 v2 本地测试口径；原文全部13章及原US-001..008必须保留。除已明确测试参数外，其它待定政策须报告协调者，不得自行标为必须/已确认。
```

### REQ-2026-002

**需求标题：** 信用卡挂失与补卡

**需求背景（完整复制到新建需求的描述中）：**

```text
业务背景：持卡人遗失信用卡后，需要立即挂失冻结，并在线申请补卡、查看制卡与邮寄进度。提供客户自助和客服代办入口、补卡费用处理、运营补卡队列、新卡生成与旧卡失效，以及通知和审计；物流范围为运营回填快递单号与邮寄状态。

业务需求编号：REQ-2026-002
原始需求 SHA256：3a4ab0444d948b2b8fa2bb2cf7c71cab0e0c2573c2b8dbbeb8ae4937c85744e9
完整需求：Talents发布资料 four-requirements/REQ-2026-002/原始需求.md（原文v1.0）。
范围：信用卡挂失与补卡，必须读取完整原文全部13章后开展；当前任务摘要不缩减功能、接口、数据、安全与验收范围。第5章明确模拟值用于本次测试；第12.3事项保留投产待确认，内部矛盾按资料差异清单澄清，不伪造Owner确认。
试验口径版本：test-profile-v2
试验口径 SHA256：b77c194258178a08ffd90beccb5e0f038472e69615655440bdc2493b2b3813cd
本任务明确锁定 v2 本地测试口径；原文全部13章及原US-001..008必须保留。除已明确测试参数外，其它待定政策须报告协调者，不得自行标为必须/已确认。
```

### REQ-2026-003

**需求标题：** 信用卡额度调整申请与审批

**需求背景（完整复制到新建需求的描述中）：**

```text
业务背景：持卡人需要根据消费与用卡情况申请永久额度调整，并在线提交材料、查看审批进度。提供系统资格预审、资料补充、初审与终审工作台；批准后更新账户额度，拒绝时明确原因，并保留权限隔离、通知和完整审计记录。

业务需求编号：REQ-2026-003
原始需求 SHA256：a2c7283973c6cb115e9a8da5ba0154019b9ad84bb4f852b50abbb989130b5d01
完整需求：Talents发布资料 four-requirements/REQ-2026-003/原始需求.md（原文v1.0）。
范围：信用卡额度调整申请与审批，必须读取完整原文全部13章后开展；当前任务摘要不缩减功能、接口、数据、安全与验收范围。第5章明确模拟值用于本次测试；第12.3事项保留投产待确认，内部矛盾按资料差异清单澄清，不伪造Owner确认。
试验口径版本：test-profile-v2
试验口径 SHA256：b77c194258178a08ffd90beccb5e0f038472e69615655440bdc2493b2b3813cd
本任务明确锁定 v2 本地测试口径；原文全部13章及原US-001..008必须保留。除已明确测试参数外，其它待定政策须报告协调者，不得自行标为必须/已确认。
```

### REQ-2026-004

**需求标题：** 交易争议在线申请与处理

**需求背景（完整复制到新建需求的描述中）：**

```text
业务背景：持卡人对已入账交易有异议时，需要从交易详情在线提交争议原因、金额和证据，并查询进度、补充材料或撤案。提供后台案件受理、复核、临时入账、拒付与结案流程，对接交易快照、证据文件、账户、通知和审计，保留处理时限与证据链。

业务需求编号：REQ-2026-004
原始需求 SHA256：341b329ed87b60ccc4a241423a5f76c0243e45f5e9737269e095a72b5cec1484
完整需求：Talents发布资料 four-requirements/REQ-2026-004/原始需求.md（原文v1.0）。
范围：交易争议在线申请与处理，必须读取完整原文全部13章后开展；当前任务摘要不缩减功能、接口、数据、安全与验收范围。第5章明确模拟值用于本次测试；第12.3事项保留投产待确认，内部矛盾按资料差异清单澄清，不伪造Owner确认。
试验口径版本：test-profile-v2
试验口径 SHA256：b77c194258178a08ffd90beccb5e0f038472e69615655440bdc2493b2b3813cd
本任务明确锁定 v2 本地测试口径；原文全部13章及原US-001..008必须保留。除已明确测试参数外，其它待定政策须报告协调者，不得自行标为必须/已确认。
```

### 命令行预览与已有环境追加

也可在服务启动后运行以下只读命令，查看相同标题和来源描述：

```sh
cd talents
node --import tsx tools/register-four-requirements.ts --endpoint http://127.0.0.1:45980 --version 2
```

上述命令不带 `--apply`，仅显示资料和可复制描述，不创建任务或调用模型。新环境已自动登记两版，无需再次注册。已有有效 Talents 状态保持原样；需要增量补入资料时，先分别预览 `--version 1`、`--version 2`，核对后对相应命令追加 `--apply`。只追加缺少的来源，同 ID 内容冲突会明确拒绝。显式重置 Talents 后也包含两版预置资料；重置仍会清除 Talents 用户状态，不用于升级已有数据。

Teams 单独启动时可读取已提交的 `shared/seed/talents/`；Talents 启动后发布到 `shared/data/talents/`。这两处都保留 v1、v2，已采用的节点快照不会自动升级。正常启动只初始化资料；分配需求或确认准备会触发既有知识获取与原生会话流程，实际执行仍需本机 iCode、模型配置和工作目录。源码 ZIP 的资料读取不依赖 Git；验证 provenance 历史源码的测试需要包含来源提交的 Git clone。

## CardDemo 开发初始化

实际业务开发前，核对 **JDK 21、Maven 3.9+、Node.js 24、Git 和 Teams 实际使用的 iCode**。平台继续在 `main` 运行；业务代码从独立仓库检出，在「项目概览 → 工作区设置」配置本机目录、origin 和交付基线分支。新需求自动使用业务仓库的独立任务 worktree，PR 目标以绑定的基线为准；未配置时不能启动，不提供内嵌业务工程默认目录。

初始化命令、macOS/Windows 工具核对、CLI/TUI 使用及真实测试要求见 [CardDemo 初始化与交付检查](teams/docs/carddemo-development.md)。Java 单元与服务内接口测试使用 H2；Docker/PostgreSQL 用于独立跨服务验证。当前未接通的静态分析、安全扫描须明确登记，预置结果不能替代真实单测。

## 按需求重置

在仓库根目录使用同一条跨平台命令。先结束目标需求正在运行的 iCode 会话，将示例中的 `REQ-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` 替换为任务列表中的完整 ID；iCode Teams 项目的 `--project` 使用 `teams`。

当前主需求也支持重置：页面显示的 `MKT-001` 对应内部任务 ID `DEMO-MKT-001`，命令使用 `--project carddemo --task DEMO-MKT-001`。它保留需求和分配，仅清回开始前；`--remove` 仍只适用于新建的 `REQ-…` 需求。

```sh
npm run reset:task -- --project carddemo --task REQ-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

默认输出 JSON 预览，不修改数据。核对项目、任务及将清理的文件后，追加 `--apply` 执行：

```sh
npm run reset:task -- --project carddemo --task REQ-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --apply
```

重置保留需求内容、交付人和计划完成日期，清除该需求的交付流程记录及预览中列出的独占生成资料、Teams 管理的会话运行目录，使需求可以从开始前重新运行。其他需求、业务代码、原始资料和原生 iCode 全局历史保留。工具会核对活动会话与服务归属，必要时暂时停止并重新启动所属 Teams 服务，不构建应用；无法安全确认范围时会拒绝执行。

原始来源会话、trace 原始存档，以及缺少任务 ID、无法确认归属的历史分析均保留；这些来源资料不构成本次重新执行的四节点进度。

执行会自动备份，默认位置为 Teams 当前 runtime 下的 `task-reset-backups/<UUID>`，实际路径以输出为准。`--remove` 可与任务参数一起使用，仅用于删除本地新建的 `REQ-…` 需求；不带 `--apply` 时仍然只预览。撤回时只使用该次输出的备份目录，无需重新指定项目或任务：

```sh
npm run reset:task -- --restore "/absolute/path/to/task-reset-backups/backup-id"
npm run reset:task -- --restore "/absolute/path/to/task-reset-backups/backup-id" --apply
```

恢复前同样先核对预览并结束目标会话；备份后的新变化会接受冲突检查。需要纳入自定义目录中的 Teams CLI 回执时，可加 `--receipt-root` 并提供绝对目录，仍按精确项目和任务范围处理。

macOS 入口为 `./重置任务.command`，Windows 为 `reset-task.cmd`，参数与上述命令一致；无参数时只显示帮助。也可在 `teams/` 内执行 `npm run reset:task -- …`。入口沿用已有本机配置，不会自动安装依赖或选择某个任务。

## 数据怎么流动

```
Teams ── HTTP：GET /api/shared/teams（长轮询 /changes）──▶ Talents
         成员与角色、项目、代码仓（含项目工作区绑定的本机目录、origin、基线分支）、设计文档、项目 Skill、成员共享的会话
Teams ── shared/data/teams/task-sessions/ ──▶ Talents（读取尚未实现）
         独立需求验收后自动归集的任务会话

Talents ── shared/data/talents/knowledge.json + files/ ──▶ Teams
           远端索引，以及尚未改为 PR 提交的已有知识产物

Talents ── gh（PR）──▶ 代码仓
           审阅后的知识文件、Skill 修改、AGENTS.md 规则，由开发者审阅合入
```

- Talents 使用时 Teams 必须在运行：Talents 每次都向 Teams 读取当前数据，页面在 Teams 数据变化时（长轮询）或重新获得焦点时自动更新。Teams 未运行时，Talents 顶部提示未连接，仍可查看自己的任务和产物。
- 共享目录的每个子目录只有一个写入方。格式定义在 [shared/contracts.ts](shared/contracts.ts)；目录可用 `DEMO_SHARED_DIR` 指定，默认 `shared/data`（不入库）。
- 成员、项目、代码仓和设计文档以 Teams 为准，在 Talents 中只读；Talents 只登记本地文档来源。
- Talents 只有管理员入口，对应 Teams Owner（挖掘、审阅、提交 PR）；Teams 只向 Owner 展示 Talents 入口。没有开发者端，开发者在代码托管平台审阅并合入 PR。
- 文件类知识和轨迹诊断建议都以 PR 提交，Talents 只保存 PR 链接和提交内容，不查询合入状态，也不直接更新 Teams 中的 Skill 版本。
- Teams「项目知识」页展示共享目录中的产物并可预览原文；任务准备只要求 Skill 可读，项目知识为空不阻止准备。
- 任务输入由 Teams 按当前节点组装：需求与真实 Skill 包来自 Teams，加上共享目录中 Talents 写入的项目知识（没有时为空），已采用版本保持固定。
- 轨迹诊断与改进 PR 在 Talents 中完成，Teams 只负责共享交付会话。

## 演示主线

1. Teams：Owner 查看项目知识，从 Talents 入口进入知识挖掘。
2. Talents：文档集新增白金卡规则 → 审阅业务知识 v2 草稿 → 提交知识 PR。
3. Teams：成员准备上下文、开发、检查失败 → 修复 → 提交，Owner 验收后，Teams 自动归集交付会话并共享给 Talents。
4. Talents：用当前已有共享会话做轨迹诊断（新任务会话导出后的自动读取尚未接入） → 逐条提交改进 PR（修改 Skill 或向 AGENTS.md 补充规则）。
5. 代码托管平台：开发者审阅并合入 PR。

## 开发边界

此仓库以隔离状态和预置数据验证交互，不连接银行支付系统。原生 iCode 准备与执行会调用本机已配置的模型，须按任务入口确认或显式 CLI 指令发起；初始化预览不启动模型。界面结果不能替代生产运行、模型实验或安全扫描证据。活动日期、金额舍入等测试假设见 [设计说明](teams/docs/demo-design.md)。仓内 Java/业务 Skill 快照（`workspace/`）为来源资料，不代表白金卡规则已经部署到 Java 服务。

从旧的 `demo/` 目录迁移到当前结构，见 [MIGRATION.md](MIGRATION.md)。

## 验证

```sh
npm test                                   # Teams 单元测试 + HTTP 集成 + Talents 测试
cd teams && npm run typecheck && npm run build && npm run test:e2e
cd talents && npm run typecheck && npm run build && npm run test:e2e && npm run test:codegraph:e2e
```
