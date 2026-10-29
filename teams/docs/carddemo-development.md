# CardDemo 初始化与交付检查

本指南适用于 Credit Card 项目的实际代码开发。Teams/Talents 与业务代码使用**独立 Git 仓库**。先核对工具，在项目概览中保存业务工作区，再从需求绑定的独立工作区执行开发与测试。

## 独立业务仓库（推荐）

```sh
git clone https://github.com/JeffyLiu003/carddemo-java-1025.git /absolute/path/carddemo-java-1025
```

进入 Teams → 项目 → Credit Card → 项目概览 → 工作区设置，填写本机仓库根目录、上述 Git 仓库地址、交付基线分支（该仓库已有 `main`，也可使用自行维护的 `develop`），点击“保存工作区”。Windows 同样填写本机绝对路径，例如 `D:\projects\carddemo-java-1025`。Git、iCode、JDK 21、Maven 必须在运行 Teams 的同一设备上可用。保存会核验目录为 Git 根目录、origin 与填写的仓库相符、基线分支在本地存在；不会自动 checkout、pull、push 或复制未提交代码。

Agent 管理中的普通 iCode/OpenCode 启动使用当前默认项目目录。已分配的新需求在知识获取完成、会话初始化前，自动从**业务仓库本地基线分支当前提交**创建独立 worktree：`<业务仓库名>-tasks/<任务标识>/`，分支 `codex/<项目>-<任务标识>`。TUI、CLI、产物预览与清理都使用同一任务绑定。PR 目标为保存的交付基线分支；该分支需已发布到目标远端才能创建 PR。没有远端写权限时如实回报阻塞，不向 Teams 仓库提交业务代码。

设备配置在实际 Teams 状态目录的 `project-workspaces.json`，新任务固定绑定在 `project-worktree-bindings.json`。状态目录以本机 `teams/.local/config.json` 中 `DEMO_STATE_DIR` 或服务 `/api/health` 的 `stateRoot` 为准。绑定记录仓库、分支、基线 SHA 和绝对目录；修改默认配置只影响后续任务，已有会话与旧任务继续使用原绑定，不能静默迁移。每台机器需要分别 clone 并保存本机路径，不将本机配置提交 Git。

内嵌业务工程已移除。fixtures 与已发布 Talent 文件中的旧路径仅记录历史素材来源，不用于解析当前执行目录。保留原来源及 SHA256，不能把外部仓库新版本伪装为旧素材版本。


## 启动前核对

| 用途 | 要求与检查 |
|---|---|
| 平台和工作区工具 | Node.js 24、npm、Git；运行 `node --version`、`npm --version`、`git --version` |
| CardDemo Java 构建与测试 | **JDK 21**、Maven 3.9+；运行 `java -version` 和 `mvn -version`，两处都应显示 Java 21 |
| 原生作业 | 本机 iCode 和已配置的 Agent/模型；检查 `icode --version`，再以 Teams「引擎定位」及作业计划解析的实际入口为准 |
| GitHub 提交／PR | Git 提交身份、目标仓库访问权限、已登录的 GitHub CLI；检查 `git var GIT_AUTHOR_IDENT`、`gh --version`、`gh auth status --hostname github.com`，不要输出或复制 token |
| 轨迹页 | Python 3.10+ 与 trace-server 依赖；iCode 自身的 trace exporter 另按[快速启动](quick-start.md#icode-tui-与-trace)检查 |
| 跨服务冒烟 | Docker/Compose、Bash、curl、Python 3；`docker compose version` 和 `docker info` 只核验引擎，业务服务还需启动和健康检查 |
| 静态检查与依赖／密钥扫描 | Maven PMD 插件 3.26.0、Trivy；`trivy --version`。PMD 由下文的固定 Maven 坐标获取，Trivy 需另行安装；本流程已使用 Trivy 0.76.1 |

父 POM 的 `java.version` 和 `maven.compiler.release` 均为 21。已有测试曾在 JDK 27 下因 Mockito/Byte Buddy 不支持该 Java 版本而失败；使用 JDK 21，不用跳过测试或实验兼容开关掩盖失败。设置环境后再启动 Teams，使原生作业继承同一工具链。

macOS 当前终端选择已安装的 JDK 21：

```sh
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"
command -v java mvn node git icode
java -version
mvn -version
```

Windows PowerShell 使用实际安装目录替换下例路径：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Get-Command java,mvn,node,git,icode
java -version
mvn -version
```

`JAVA_HOME` 应指向 JDK 根目录。PATH 上的 iCode 与 Teams 的 `DEMO_ICODE_BINARY` 可以不同；核验实际作业版本，保留现有用户模型配置。网页运行无需 JDK 或 iCode，实际 CardDemo Java 开发和原生作业分别需要这些工具。

Teams 新启动的 iCode CLI／TUI 子进程会合并已有 `NO_PROXY` 和 `no_proxy`，补入 `127.0.0.1`、`localhost`、`::1`（以及部分客户端需要的 `[::1]`），避免本机 API、轨迹和独立测试请求走外网代理。其他代理配置保持原值，不改系统环境；已运行会话不会被追改。在 Teams 外手动运行测试时，也应在当前终端为本机地址配置代理排除，并保留原有排除项。

缺少工具时，先安装 JDK 21、Apache Maven、Docker Desktop（启用 Linux 容器）、Git/GitHub CLI 和 Trivy，再核对实际版本。macOS 可用包管理器或官方安装包，Windows 可用官方安装包或已批准的包管理器；不要把另一台机器的绝对路径复制为配置。Maven 首次需要下载插件与依赖，Trivy 首次需要获取漏洞库；下载失败须保留错误并解决，不能改用空报告。仅在项目 POM 明确需要时增加其他服务，本基线无需 Redis。

## 项目工作区与需求目录

业务仓库必须位于 Teams 仓库之外。由维护者在该仓库获取所需远端提交、更新本地交付基线，再在项目概览保存目录、origin 和基线分支；不自动 fetch、切分支、push 或搬运未提交代码。初始化会话前，Teams 仅从已配置业务仓库的基线提交创建任务 worktree。

旧的 `carddemo-workspace.json` 和旧任务目录记录只作为历史资料保留，不再提供在 Teams 仓库初始化业务分支的命令。已有任务保持原目录、分支和会话，缺失目录时明确报错，不替换成当前项目工作区。重新运行时使用新任务和新绑定。

## 页面 TUI 与显式 CLI 作业

先在 Teams 分配需求，等待当前节点知识获取完成，并按页面提示确认准备会话。真实会话准备完成后，交付人可以从「iCode 作业」进入同一会话的 TUI，输入本次节点的工作指令；已有活动窗口按计划进入，不重复新建。查看他人任务不会取得执行权限。

需要通过命令明确下发工作时，在平台仓库的 `teams/` 目录使用以下入口。先把 `<任务ID>`、`<UUID>` 和指令文件路径替换为实际值；`--role` 必须与该需求交付人一致，节点内部 ID 为 `prepare`、`develop`、`verify`。

```sh
npm run work:icode -- plan --endpoint http://127.0.0.1:45970 --role member --project carddemo --task <任务ID> --node prepare --mode cli
npm run work:icode -- start --endpoint http://127.0.0.1:45970 --role member --project carddemo --task <任务ID> --node prepare --mode cli --request-id <UUID> --instruction-file "/absolute/path/prepare.txt"
npm run work:icode -- status --endpoint http://127.0.0.1:45970 --role member --project carddemo --task <任务ID> --node prepare --request-id <同一UUID>
```

指令文件使用 UTF-8，明确本节点目标、允许修改的业务目录、测试与停止条件，以及是否允许提交／推送／创建 PR；也可用 `--instruction "工作指令"`，两者只能选一个。Windows 使用实际 Windows 路径。`plan` 和 `status` 只读；`start` 仅恢复已准备、未活动的本任务真实会话，未就绪时先回 Teams 完成准备。它实际调用 iCode 执行本次节点指令，不自动跨阶段。

启动回执给出 request/session、上下文及日志路径；`status` 区分 pending、running、completed、failed、unknown。退出码 0 表示请求成功，不能据此判断节点已完成；1 表示参数或请求失败，2 表示执行失败、状态未知或需要核对。保留默认 runtime 下 `work-cli-receipts` 的请求与回执，或显式指定 `--receipt-dir`。超时先用原 request ID 查询；重试保留原 ID、scope 和同一指令，不删除回执绕过冲突。

原生启动 CLI 与协作 CLI 分工不同：`work:icode` 负责启动／查询，iCode 内通过 [`teams-demo.mjs` 与协作 Skill](../skills/teams-demo-collaboration/SKILL.md) 拉取当前节点上下文、记录实际采用、回传进度和真实产物。每个业务 run 都应先实际读取当前节点所需上下文，再收到 `inputs adopt` 成功回执、`progress add` / started 成功回执，随后编辑业务文档／代码或运行测试，不能事后补开始记录。下一节点输入按阶段获取，未 ready 时等待，不提前使用全量知识；会话就绪与命令退出不代替采用、测试或人工验收。

## 测试与交付证据

以下命令在工具返回的 CardDemo 业务代码目录执行。首次核验基线建议完整运行：

```sh
mvn -version
mvn -B -ntp package
```

`package` 会执行测试并生成容器构建所需 JAR；仅测试可用 `mvn -B -ntp test`。已登记基线有 8 个 Maven 模块，使用 JUnit 5、Spring Boot Test、MockMvc、Mockito；7 个业务服务的测试数据源是 H2，迁移由 Flyway 执行，跨服务调用使用测试替身。模块和测试总数以所选提交为准，新增业务不能沿用旧基线数量作为覆盖证明。普通 Maven 测试不需要外部 PostgreSQL、Redis 或 Docker，H2 结果不能替代 PostgreSQL 跨服务验证。

返现相关改动的定点命令为：

```sh
mvn -pl services/card-service,services/marketing-service,services/transaction-service,services/web-ui -am test
```

根据实际变更补齐其他受影响模块。必要范围必须全部执行通过；测试失败、跳过、未运行时保持开发阻塞，不提交“开发完成”。`scripts/build-and-up.sh` 使用 `-DskipTests package`，启动成功不提供测试通过证据。

| 检查 | 当前工具与边界 | 证据 |
|---|---|---|
| Java 单元／服务内接口 | 上述 Maven 测试；H2/Flyway、MockMvc/Mockito | 各模块 `target/surefire-reports/` 的 XML/text、完整命令和退出码 |
| 跨服务功能集成 | `docker-compose.yml` 的 PostgreSQL 16 和服务；`scripts/smoke-test.sh` 使用 curl/Python | 健康检查、HTTP 断言与日志；脚本会登录、入账和授权，只在独立测试数据环境执行 |
| 前端逻辑／功能 | 以当前需求分支实际存在的测试为准；Maven 不自动执行 Node 测试 | 单独的 Node／浏览器结果。旧目录的未提交测试不会自动进入新基线 |
| 代码静态检查 | Maven PMD 3.26.0；编译和 `git diff --check` 另行核对 | 各模块 PMD XML/HTML、规则、优先级、命令与退出码；与 Agent Review 分开 |
| Agent Review | iCode 按代码版本和 `dev-code-reviewer` 等实际选用 Skill 进行审阅 | 模型／Agent、代码版本、问题位置与结论；与静态工具报告分开 |
| 安全扫描 | Trivy 文件系统依赖／密钥扫描；安全 Skill 提供审查规范 | 工具和漏洞库版本、POM/JAR 范围、原始 JSON 与逐项结论；不等于容器 OS 扫描或渗透测试 |
| 修复与复验 | 针对失败问题修改后重跑原失败检查及必要回归 | 问题 ID、修复版本、前后报告和退出码，保留失败记录 |

### 独立 PostgreSQL／跨服务环境

默认 `docker-compose.yml` 有固定容器名、端口和数据库卷；**仅增加 `-p` 不足以隔离这些固定值**。每个需求使用自己的 Compose 配置和数据库，先从该任务业务目录生成可审阅配置：

```sh
docker compose --project-directory "<任务业务目录>" -p "carddemo-e2e-<任务短标识>" -f "<任务业务目录>/docker-compose.yml" config --format json --output "<忽略的任务证据目录>/compose.json"
```

生成前在本终端设置专用 `IAM_TOKEN_SECRET`，避免沿用默认示例密钥。配置文件包含展开后的环境信息，仅保存在本机忽略目录，不提交或公开。在启动前检查并调整该文件：移除固定 `container_name`；宿主端口绑定 `127.0.0.1` 并使用空闲端口（`published: "0"` 可由 Docker 分配）；卷和网络名称带唯一任务前缀且非 external；构建目录、只读初始化 SQL 绑定都属于当前任务 worktree；不启用 host network 或 privileged。批次已有独立配置时复用它，不另起一套或接入别人数据库。

```sh
docker compose -f "<任务证据目录>/compose.json" config --quiet
docker compose -f "<任务证据目录>/compose.json" up -d --build --wait --wait-timeout 180
docker compose -f "<任务证据目录>/compose.json" ps
docker compose -f "<任务证据目录>/compose.json" port iam-service 8081
docker compose -f "<任务证据目录>/compose.json" port web-ui 8080
```

先构建 JAR，再构建容器。`--wait` 不替代 HTTP 验证：逐服务检查 `/actuator/health`，业务服务另检查 `/v3/api-docs`，并验证 Web 入口与本需求接口。动态宿主端口在重启后可能改变，每次重新读取映射；内部服务间地址继续使用 Compose 服务名。

现有 `scripts/smoke-test.sh` 接受 `IAM`、`CUSTOMER`、`CARD`、`ACCOUNT`、`TRANSACTION`、`AUTHORIZATION`、`MARKETING` 七个完整 HTTP origin 环境变量。将它们全部设为该独立环境的实际端口后，从任务业务目录运行 `bash scripts/smoke-test.sh`；不要遗漏后回落默认端口。脚本会登录、入账和授权，日志中的 token 应脱敏。它只覆盖基线冒烟；新增需求还需实际权限拒绝、幂等／并发、错误边界、重启持久性，以及需求约定的性能和审计检查。Windows 可在 Git Bash 中运行 Bash 脚本；macOS 实测不代表 Windows GUI 或 Docker 已实测。

### PMD 与 Trivy

在已固定代码版本的任务业务目录执行，报告输出到该任务的忽略证据目录：

```sh
git diff --check
mvn -B -ntp org.apache.maven.plugins:maven-pmd-plugin:3.26.0:pmd
trivy --version
trivy fs --scanners vuln,secret --format json --output "<任务证据目录>/trivy.json" .
```

PMD 的 `pmd` 是生成报告的 goal，成功退出不表示零问题；检查各模块 `target/pmd.xml`／`target/site/pmd.html`。Trivy 默认成功退出也不表示无漏洞，检查 JSON 中的漏洞与密钥结果，保留实际版本、扫描时间和数据库信息。先 `package` 再扫，使构建 JAR 及其中运行依赖进入核查范围；同一依赖在多个服务出现时可汇总，但不删除原始结果。

把当前任务新增风险、基线已有风险和未覆盖范围分开。依赖告警即使当前应用未具备触发条件，也保留其原始严重级别并给出源码／配置依据；新需求可能改变适用性，必须重核。不要凭 Skill、模型总结、无 findings 的退出码或忽略规则宣称“安全通过”。这里的手动工具不等于 GitHub 已配置 Java CI；PR 无 check 时需明确列出实际本地验证。

已有本地前端功能测试可能依赖仓库外的 jsdom 路径；这类脚本须先在需求分支中登记可复现依赖和执行方式，不能作为新基线已具备的通用测试。不要为消除缺工具错误自动下载或静默跳过。

每项报告至少保留：任务与节点、代码 commit／未提交 diff 摘要、工具和版本、完整命令、执行时间、退出码、通过／失败／跳过数量、日志和问题引用。原始 Maven 报告保留在各模块 `target/`。PRD、设计、业务代码和测试应提交到任务分支；PR head 固定后生成的运行报告可放在独立忽略证据目录，正文写明被测 SHA，避免为提交含 SHA 的报告本身不断改变版本。Teams 成果回传引用真实文件和同一代码版本。`preset` 只用于明确允许的验证流程检查，不能充当真实开发单测、真实扫描或真实模型执行证据。

## PR 验收与交付基线更新

开发者已明确授权提交时，iCode 可在本任务绑定的 `codex/carddemo-…` 分支提交、推送并创建 base 为项目所配置交付基线分支的 PR；不能直接推平台 `main` 或业务交付基线，不能替 Owner 合并。只暂存本需求的明确文件／变更块，不用 `git add .` 带入已有脏文件。PRD、设计与代码提交、单测报告、验证报告必须对应当前 PR head；后续修复改变 SHA 后重新验证，不借旧报告通过。

Owner 先检查需求范围、PR diff、真实原生工具／CLI 回执、必要测试和静态／安全报告，再在 Teams 明确验收或退回。通过后核对任务会话归集共享回执。维护者在获得合并授权后执行：

```sh
gh pr view <PR号或URL> --json baseRefName,headRefName,headRefOid,state
gh pr diff <PR号或URL>
gh pr checks <PR号或URL>
gh pr merge <PR号或URL> --merge
```

无自动检查不等于检查通过。合并后，在**所配置交付基线分支的独立 checkout/worktree** 中确认工作区干净，再快进；不要在平台 main 或任务工作树里执行这组更新：

```sh
git -C "<业务基线checkout根>" status --short
git -C "<业务基线checkout根>" fetch origin <交付基线分支>
git -C "<业务基线checkout根>" merge --ff-only origin/<交付基线分支>
git -C "<业务基线checkout根>" rev-parse HEAD
```

若不干净或不能快进，先定位冲突，不 reset、不强推、不复制旧 checkout 的脏业务代码。下一需求新绑定将以更新后的交付基线 HEAD 为基线，已有需求绑定和会话不迁移。

## 回退代码、重跑任务与清理环境

这三件事分别处理，先保存验收证据并确认相关原生任务已结束：

| 目的 | 操作 | 不会改变 |
|---|---|---|
| 撤回已合并试验业务代码 | 从最新远端交付基线新建回退 worktree／分支，用 `git revert` 后向同一基线提 PR | 平台 main、原 checkout 脏改动、历史会话和 Teams 验收记录 |
| 将某需求流程清回开始前 | 精确 `reset:task --project carddemo --task …`，先预览再 `--apply` | 已提交业务代码、Git PR／合并历史、其他需求和全局 iCode 历史 |
| 释放本次测试资源 | 使用本需求准确 Compose 文件 `down -v` | 其他 Compose 项目和业务 Git 内容 |

用户已批准的试验合并需要还原时，维护者可从已核对的最新交付基线创建专用回退分支。对 merge commit 使用 `-m 1`，按合并的逆序逐一 revert；若原 PR 是 squash／普通提交则不用 `-m`，先核对提交父节点。示例只表示一个已确认 merge commit：

```sh
git fetch origin <交付基线分支>
git worktree add -b codex/carddemo-revert-batch "<新的回退worktree绝对路径>" origin/<交付基线分支>
git -C "<回退worktree根>" show --no-patch --format="%H %P" <待撤回mergeSHA>
git -C "<回退worktree根>" revert -m 1 <待撤回mergeSHA>
```

在回退工作树运行受影响测试，核对只撤回本批业务变更，再推该分支、创建以交付基线为 base 的回退 PR，经审查合入并快进该基线。不要用 `reset --hard`、强推或手工覆盖代码抹掉历史；后续任务已依赖这些改动时，先评估逆序回退影响。

任务数据重置的预览、备份恢复和活动会话保护见[根目录按需求重置](../../README.md#按需求重置)。它会归档明确属于该任务的生成资料及 Teams 原生副本；需要长期留存的验收报告先保存。撤回 reset 备份不等于撤回 Git revert。独立运行环境仅在无人使用后清理：

```sh
docker compose -f "<该任务的准确compose.json>" down -v
```

`-v` 会删除该环境数据库卷；先核对 Compose project 与容器标签，不执行全局 prune，也不使用别人的配置文件。任何步骤遇到未知活动会话、身份／版本冲突或损坏材料时停止并报告，不降级成整库清空。
