# iCode Talents 演示

独立启动的本机服务（Node 24+）。团队、成员、项目、代码仓、设计文档和团队共享的会话来自 iCode Teams；Talents 面向 Teams Owner：挖掘并审阅知识，文件类知识和轨迹诊断的改进建议通过 `gh` 以 PR 提交到代码仓，由开发者在代码托管平台审阅合入。索引类知识（CodeGraph 等）保留在远端，写入共享数据目录供 Teams 展示。

```bash
cd talents
npm install
npm run dev        # 构建页面（dist/）并启动，打开 http://127.0.0.1:45980/talents
```

设计说明见 [DESIGN.md](DESIGN.md)。

## 与 iCode Teams 的数据交换

数据格式见 `shared/contracts.ts`。

**从 Teams 读取（HTTP）**：Talents 使用时 Teams 必须在运行。团队成员（owner / member）、项目及其代码仓、设计文档、项目 Skill 和共享会话，每次都向 Teams 的 `GET /api/shared/teams` 读取，不在 Talents 中保存。页面向 Talents 服务长轮询 `GET /api/teams?after=<revision>`，服务再等待 Teams 的 `GET /api/shared/teams/changes`：Teams 数据一变（包括在项目概览中绑定工作区），页面就替换来自 Teams 的部分；页面重新获得焦点时也会立即检查一次。Teams 未运行时，顶部提示“未连接 iCode Teams”，页面保留最近一次读到的 Teams 数据，Talents 的任务和产物照常可看，每 5 秒重试；需要 Teams 的操作（读取项目 Skill、PR 默认目标）返回 503。

**写入共享目录**：共享数据目录默认是仓库根目录的 `shared/data/`（`DEMO_SHARED_DIR` 可改）。

| 文件 | 写入方 | 内容 |
|---|---|---|
| `talents/knowledge.json` | Talents | 远端索引，以及尚未改为 PR 提交的已有产物；已提交 PR 的产物不再写入 |
| `talents/files/<产物>/v<版本>/<路径>` | Talents | 上述产物对应版本的文件 |

Teams 读取时共享目录中缺少某个文件，会读取 `shared/seed/` 下同一路径的提交版本。修改 `server/seed.ts` 或 `content/` 后，运行 `npm run seed:shared` 重新生成 `shared/seed/talents/`。

Teams 数据在 Talents 中的对应关系：

- **角色**：只有管理员入口，对应 Teams 的 Owner（默认林悦）；Teams 只向 Owner 展示 Talents 入口。Teams 用 `/talents?role=owner#/<页面>?project=<项目>` 打开指定项目，页面为 `sources`、`tasks`、`review`。旧的 `dev-knowledge`、`knowledge`、`local` 地址转到“项目”。
- **项目**：Teams 中的全部项目。从其他 Teams 导入、在 Teams 中只读浏览的项目（iCode Teams）标“导入项目”。
- **代码仓**：Teams 项目的代码仓，只读。路径、远端（origin）和分支取自 Teams 项目概览中绑定的项目工作区；未绑定的代码仓显示“未在 iCode Teams 绑定本机目录”，不能用来新建知识任务。代码仓 ID 与绑定无关，绑定或改绑不影响已有任务和产物。最近提交、PR 列表是 Talents 的 mock 数据。
- **代码图谱**：唯一真实执行的能力，见下文“构建代码图谱”。图谱读取代码仓 `.codegraph/` 中的索引。初始数据中没有代码图谱，在 Talents 中第一次构建一个代码仓后才有它的代码图谱产物。
- **文档集**：每个 Teams 项目的设计文档合成一个文档集“<项目名>文档”，只读。版本记录和最近检查由 Talents 保存；“检查更新”发现 Teams 中的文档有增删时记录新版本。
- **本地文档来源**：Talents 唯一自己登记和保存的来源（例如“银行开发规范”）。
- **会话**：Teams 中成员共享的会话，列在项目来源中；都可以选来做轨迹洞察，演示中每次分析都产出同一份预置的诊断报告。
- **项目 Skill**：Teams 项目的“项目可用 Skill”，列在项目来源中，SKILL.md 只读：Credit Card 的从本仓库读取，iCode Teams 的随 Teams 数据一起提供（它们只存在于导入快照中）。轨迹洞察的 Skill 建议以 PR 修改代码仓中的 Skill 文件，Talents 不直接更新 Teams 中的 Skill 版本，也不查询 PR 是否合入。

Talents 自己的状态（任务、产物、PR 提交记录与提交内容、诊断建议的处理、本地文档来源、对 Teams 来源的元数据）保存在 `.runtime/state.json`（`DEMO_TALENT_STATE_DIR` 可改）。

## 构建代码图谱

CodeGraph 任务由服务端真实执行，其他能力仍是页面中的模拟运行。

- **在哪里构建**：Teams 中为代码仓绑定的本机目录，按目录中的当前代码构建：不切换分支，不拉取远端。未绑定的代码仓不能新建 CodeGraph 任务。
- **怎么构建**：运行 iCode Knowledge 的 CodeGraph 引擎脚本 `engines/codegraph/run.py`（原样复制，来源 iCode Knowledge 仓库 `engines/codegraph/scripts/run.py`）：先自检，再在没有索引时 `codegraph init`、已有完整索引时 `codegraph sync`，最后用 `codegraph status` 校验。索引写在代码仓的 `.codegraph/`。需要 python3（Windows 上为 `py`）和 codegraph v1.6.0；服务启动 codegraph 时会把官方安装位置 `~/.local/bin` 加到 PATH。carddemo 一次构建约 10 秒。
- **安装**：“知识能力”中 CodeGraph 卡片按本机自检（`run.py --check`：环境检查、查找 codegraph、`codegraph --version`）显示“已安装”，否则显示“安装”。安装运行 `content/engines/codegraph/engine.yaml` 为本平台声明的安装命令（官方安装脚本，固定 v1.6.0，装到 `~/.codegraph`，命令入口 `~/.local/bin`；Windows 为 `install.ps1`），确认后在后台执行，结束后再自检；能力详情中有“本机安装”一栏，显示自检结果、安装日志和“重新检测”。安装和构建不同时进行。服务按自身环境的 PATH 查找 codegraph（再加上 `~/.local/bin`），PATH 中靠前的那一份优先。
- **任务**：CodeGraph 任务只能立即执行，不能定时，也不能取消（中途停止 codegraph 可能留下它拒绝再更新的残缺索引，需要删除 `.codegraph/` 后重建）。任务详情显示真实日志。同一个代码仓同时只能有一个构建。服务在构建中停止时，这次运行记为失败。
- **图谱**：每次打开代码图谱（或点图谱上的“刷新”）都读取代码仓 `.codegraph/codegraph.db` 的当前状态，所以 iCode 中 codegraph MCP 自动同步的变化、在 Talents 之外运行的 `codegraph sync` 也会显示出来。索引文件没有变化时直接用上次生成的图谱数据。索引正在构建或同步（状态不是 complete）时，显示上次生成的图谱并提示；从没生成过时提示稍后刷新。代码仓目录取 Teams 中的绑定，Teams 未运行时取上次构建的目录。
- **视图**：服务端保留整张图，页面每次只拿当前视图要画的部分，搜索、节点详情和源码也按需请求（iCode 这样 9 万节点、33 万关系的仓库，页面不再下载 85 MB 的全图）。
  - “目录结构”（目录和文件，按类型着色）、“文件关系”（按语言着色）、“符号关系”（按节点类型着色），没有服务的划分。目录逐级展开：点目录“展开目录”或“查看文件”，点文件“查看文件内符号”；顶部路径可以返回上级。目录视图一级一级往下分，直到再分会超过 30 组；只有一项的目录直接并入下一级。
  - 默认不含测试（按常见写法识别：`test`、`tests`、`__tests__`、`spec` 目录，`test_*.py`、`*_test.go`、`*.test.ts`、`*Test.java` 等文件）。打开时，不含测试的符号不超过 2,000 个就显示符号关系，否则显示目录结构。
  - 每个视图最多画 2,000 个节点、6,000 条连线：超出时保留离聚焦点最近、关联最多的节点和关系最多的连线，并提示画出了多少。搜索覆盖整个代码仓，选中结果后显示它的邻域。
- **产物**：不需要审阅，也不显示版本号（打开时显示的总是索引的当前状态）；卡片和详情显示索引更新时间和提交，包括在 Talents 之外的 `codegraph sync`。每次 Talents 构建成功，导出给 Teams 的版本加一。产物卡片和详情中的“应用”为 iCode 的 Code Agent 配上 codegraph MCP：在 `~/.chrys/agents/Code.yaml`（覆盖内置 Code Agent 的用户配置）的 `tools.mcp` 中加入 `icode-knowledge-codegraph`（`codegraph serve --mcp`），文件其余内容不变，改动前备份为 `Code.yaml.bak`；没有这个文件时先复制内置的 Code Agent 配置；已有 codegraph MCP 时显示“已应用到 Code Agent”。在已构建索引的代码仓中新开 iCode 会话即可查询。
- **数据**：运行记录和为可视化生成的图谱数据在 `<状态目录>/codegraph/`（不写进 `.codegraph/`，那里由 codegraph 管理）；“重置数据”清除它们（构建中不能重置），代码仓中的 `.codegraph/` 保留。代码仓没有提交 `.codegraph/.gitignore` 时，构建后 `git status` 会多出未跟踪的 `.codegraph/`。

## 提交 PR

“提交 PR”和“提交改进 PR”由服务端调用本机 `gh api` 完成，需要先 `gh auth login`，账号对目标仓库有写权限。服务端不会修改本机任何代码仓的工作区。

目标仓库：默认是 Teams 项目概览中为该项目绑定的工作区的 origin（解析为 GitHub `owner/repo`）和交付基线分支，文件写在仓库根目录（知识文件在 `docs/knowledge/<产物>/`）。项目未绑定工作区，或 origin 不在 GitHub 上时，弹窗提示原因并链接到 Teams，可以手动填写。演示前在 Teams 中为 Credit Card 绑定 `JeffyLiu003/carddemo-java-1025` 的本机克隆，演示账号需要对它有写权限。

提交过程：

1. 读取目标分支的最新提交，在其上创建一个新提交（文件内容随请求一起写入 Git 树）。
2. 推到专用分支 `talents/<摘要>`，摘要由仓库、目标分支、产物、建议和文件内容算出；重试时先按分支查找已有 PR，不会重复创建。
3. 创建 PR，保存 PR 链接和提交的文件内容。之后不查询合入状态。

提交的内容：

| 来源 | 写入的文件 |
|---|---|
| 知识产物（业务知识、开发范式等） | `workspace/docs/knowledge/<产物>/<路径>`，内容为审阅后的当前版本 |
| Skill 建议 | `<仓内 Skill 目录>/<文件>`，默认目录 `workspace/.agents/skills/<Skill>`（iCode 自动加载这个目录，Teams 也从这里读取 Skill）。目标文件与诊断时的内容不一致时拒绝提交；原文件是 CRLF 换行时保持 CRLF |
| 工具调用、任务指令建议 | 在 `workspace/AGENTS.md` 末尾补充一条规则（文件不存在时新建） |

## 配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `DEMO_TALENT_PORT` | 45980 | Talents 端口 |
| `DEMO_PORT` | 45970 | Teams 端口：读取 Teams 数据，以及“返回 iCode Teams”链接 |
| `DEMO_SHARED_DIR` | `<仓库>/shared/data` | 共享数据目录 |
| `DEMO_TALENT_STATE_DIR` | `talents/.runtime` | Talents 状态目录 |
| `DEMO_ICODE_AGENTS_DIR` | `~/.chrys/agents` | “应用”写入的 iCode Agent 配置目录 |

也可以写在 `talents/.local/config.json`（格式与 `teams/.local/config.json` 相同，`DEMO_LOCAL_CONFIG` 可指定其他文件）。

## 接口

| 接口 | 说明 |
|---|---|
| `GET /api/health` | 服务信息 |
| `GET /api/bootstrap` | Talents 状态合并 Teams 数据（团队、项目、来源、会话），以及 Teams 的地址、是否在线和数据版本（`teams: { origin, online, revision, error? }`） |
| `GET /api/teams?after=<revision>` | 来自 Teams 的部分。带 `after` 时先等待 Teams 数据变化（最长约 25 秒），没有变化返回 `{ changed: false, teams }`；变化或不带 `after` 时返回 `{ changed: true, teams, data }` |
| `PUT /api/state` | 保存页面上的状态（`{ revision, state }`，按 revision 检查冲突）。服务端去掉来自 Teams 的部分，只保存 Talents 自己的数据，然后更新共享目录中的知识 |
| `POST /api/reset` | 恢复初始数据 |
| `GET /api/pull-requests/target?project=<项目>` | 项目默认的 PR 目标：`{ repository, base }`，取自 Teams 中绑定的工作区；未绑定时 404，Teams 未运行时 503 |
| `GET /api/codegraph/<项目>?source=<代码仓>&level=&scope=&tests=&kinds=&relation=&focus=&hops=` | 代码图谱的一个视图（`shared/codegraph.ts` 的 `GraphPage`：`options` 为实际采用的层级和筛选，`total` 为限制前的规模）。不带 `snapshot` 时为打开：读取索引的当前状态（有变化时重新生成）；索引更新中或已删除时为上次生成的图谱，`notice` 说明原因；没有索引也没有生成过时 404，索引首次构建中 409。带 `snapshot` 时用这份图谱，图谱已重新生成时 409 |
| `GET /api/codegraph/<项目>/search?source=&snapshot=&q=&tests=` | 在整个图谱中按名称（文件还按路径）搜索，最多 30 项 |
| `GET /api/codegraph/<项目>/node?source=&snapshot=&id=`、`/source?source=&snapshot=&id=` | 节点详情和前 40 个关联；源码片段（取自生成图谱时与索引一致的源码） |
| `POST /api/codegraph-runs` | 开始构建（`{ taskId, projectId, sourceId }`），代码仓取 Teams 中绑定的目录；未绑定 400，同一代码仓正在构建 409，Teams 未运行 503 |
| `GET /api/codegraph-runs` | 每次构建对任务的更新（`runs`：运行中的进度和日志，或结果），以及代码图谱产物；页面在有构建运行时每秒读取一次 |
| `GET /api/engines/codegraph`、`POST /api/engines/codegraph/install` | 本机 CodeGraph：自检结果（`status.state` 为 `installed`、`missing` 或 `failed`，`?check=1` 重新自检）、最近一次安装（进度和日志）和安装命令；POST 开始安装，正在安装或有构建运行时 409 |
| `GET /api/codegraph-mcp`、`POST /api/codegraph-mcp` | Code Agent 是否已配置 codegraph MCP（`{ configured, path }`）；POST 为它配上 |
| `POST /api/pull-requests` | 提交 PR（`{ artifactId, suggestionId?, repository, base, note, skillDirectory? }`）。每开始一步返回一行 `{ step }`（0 读取分支、1 核对文件、2 生成提交、3 创建分支、4 创建 PR），最后一行是 `{ boot }`（最新状态）或 `{ error }`；弹窗据此显示进度。同一产物或建议提交中时返回 409 |

## 演示脚本（约 10 分钟）

以 Owner（林悦）身份演示；顶栏左侧的系统切换选“iCode Teams”回到 Teams 中的项目。演示前先启动 Teams，确认 `gh auth status` 已登录，并在 Teams 的 Credit Card 项目概览中绑定业务仓工作区（PR 默认提交到它的 origin 和基线分支）。

1. **项目**：点进“Credit Card”，在“来源”页签介绍来自 Teams 的代码仓和文档集；打开“设计文档”，看版本记录和“检查更新”；再看“会话与 Skill”中成员共享的会话和项目 Skill。
2. **知识能力**：按四类介绍能力，说明“更新”字段：CodeGraph、文档 RAG 检索、业务知识提取在来源变化后只处理变化的部分；点开卡片，在右侧抽屉看能力的详细介绍（输入、核心能力、输出）。
   可以演示导入自定义能力：右上角“导入能力”，点“使用示例定义包：数据库结构索引”，看校验结果和能力定义后导入，再在详情中“新建任务”。
3. **知识任务**（项目的“知识任务”页签）：“当前任务”分定时任务和一次性任务；定时任务可以暂停。“已完成”中有一条轨迹洞察任务，打开看产出和日志。运行中的任务可以取消，任务可以在详情中删除。
4. **产物管理**（项目默认打开的页签，页签上显示待审阅的产物和待提交的建议数量）：
   - 打开“信用卡营销返现业务知识”（新版本待审阅），切到“对比”，看与上次版本 v1 的差异。
   - 点“提交 PR”，GitHub 仓库和目标分支已按 Teams 绑定的工作区预填，提交后右侧显示“PR 已创建”和 PR 链接，由开发者在代码托管平台审阅合入。
   - 打开“轨迹洞察：CardDemo 迁移与扩建（19 轮）”（卡片提示“3 条优化建议待提交”），先看诊断报告，再逐条看建议：
     - “统一 ADR Skill、模板与校验脚本的章节契约”：点“提交改进 PR”，修改仓内 Skill arch-adr-writing 的文件。
     - “为完成声明补充最终复验与数据变更披露要求”：点“提交改进 PR”，向仓库的 AGENTS.md 补充规则。
     - “现有 zsh 调用保留脚本状态并断言业务结果”：演示“暂不采纳”。
   - 打开“carddemo-java-1025 开发范式”，看范式总结、代码分析报告和 PR 资料。
   - 构建代码图谱：在“知识任务”中新建任务，能力选 CodeGraph，代码仓选 Teams 中已绑定本机目录的代码仓，“创建并运行”，在任务详情中看真实日志；完成后“产物管理”中出现“<代码仓> 代码图谱”，打开看交互图谱；之后代码仓的索引再有变化，点图谱上的“刷新”即可看到。点“应用”，为 Code Agent 配上 codegraph MCP。
5. **团队**：团队级的来源和知识，在每个项目中都可用。
   - “来源”页签是团队登记的“银行开发规范”。
   - “产物管理”页签中的“银行编码规范要点”是团队知识；它提示“提取后文档有变化”。点“重新提取”，新建任务已预填，方式为“更新现有知识”。

演示结束后，点顶栏右侧的“重置数据”，恢复初始状态（Teams 的数据和已创建的 PR 不受影响）。

## 目录

| 路径 | 内容 |
|---|---|
| `server/` | 服务：`index.ts` 接口与静态页面，`teams-data.ts` 向 Teams 读取并映射团队、项目和来源，`codegraph-runs.ts` 在绑定目录中真实构建代码图谱，`codegraph-export.ts` 从索引生成图谱数据，`codegraph-view.ts` 打开图谱时按索引的当前状态生成（有缓存），`codegraph-query.ts` 从整张图中取出要画的视图、搜索和节点详情，`codegraph.ts` 选择显示的图谱并把构建显示在任务和产物上，`codegraph-install.ts` 检测和安装本机的 CodeGraph，`icode-agent.ts` 为 Code Agent 配置 codegraph MCP，`export.ts` 把远端索引等产物写入共享目录，`pull-requests.ts` 通过 `gh` 提交 PR，`store.ts` 状态存储，`seed.ts` 初始数据 |
| `src/` | 页面（React + TypeScript + Ant Design，外壳与 iCode Teams 一致）。`pages/` 下每个文件对应一个页面；`demo/` 是演示用的模拟逻辑（任务运行、产物生成、iCode 筛选会话、产物版本与差异）；`vendor/teams/` 原样复制自 `teams/src/vendor/teams` |
| `content/` | 产物与 Skill 的原文（业务知识、开发范式、轨迹诊断报告、配套 Skill） |
| `dist/` | 构建出的页面（`npm run build`），服务在 `/talents/` 提供 |
| `tools/` | `build.mjs` 构建页面；`bundle-content.mjs` 把 `content/` 打包为 `src/generated/content.json` 供页面预览产物；`seed-shared.ts` 生成 `shared/seed/talents/` |
| `tests/` | `npm test`：Teams 数据映射、状态保存、知识导出、PR 提交（模拟 `gh`）；`npm run test:e2e`：浏览器冒烟测试，PATH 中放入 `tests/fixtures/fake-gh.mjs` 代替 `gh`，不会创建真实 PR（需要 Google Chrome）；`npm run test:codegraph:e2e`：CodeGraph 图谱页面。CodeGraph 的测试用 `tests/fixtures/codegraph-repo.ts` 自造的小代码仓和索引（表结构与 CodeGraph 1.6 一致），构建流程用模拟的 codegraph（`tests/fixtures/fake-codegraph-*.mjs`），不需要安装 codegraph，也不依赖任何业务代码仓 |
| `engines/codegraph/run.py` | iCode Knowledge 的 CodeGraph 引擎脚本，原样复制 |
