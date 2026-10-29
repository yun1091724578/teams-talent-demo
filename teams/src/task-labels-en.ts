// 交付节点合同里的标签（节点输入、产物、完成标准）在合同里是中文；英文界面按原文查表。
// 服务端下发的 criterion/input 标签用的是同一批中文字符串，所以按文本覆盖一处即可两边生效。
// 新增或改动 task-node-contract.ts 的 label 时，这里要同步补一条，否则英文界面会退回中文。
import { currentLocale, currentT, type MessageKey } from '../../shared/i18n/index.js';

const en: Record<string, string> = {
  // 节点
  '需求澄清': 'Requirement clarification',
  '功能开发': 'Feature development',
  '测试验证': 'Test verification',
  '需求验收': 'Requirement acceptance',
  // 输入
  '原始需求': 'Original requirement',
  '已确认事项与依据': 'Confirmed items and basis',
  '业务文档与业务规则': 'Business documents and rules',
  '相关业务 Skill': 'Related business Skills',
  '已确认 PRD': 'Confirmed PRD',
  '存量代码与代码图谱': 'Existing code and code graph',
  '范式开发场景知识': 'Pattern development scenario knowledge',
  '项目开发规范': 'Project development standards',
  'PRD 验收标准': 'PRD acceptance criteria',
  '待检查代码版本': 'Code version to check',
  '企业测试资产插件 · 本需求测试用例': 'Enterprise test asset plugin · test cases for this requirement',
  '项目规范': 'Project standards',
  'Review／测试／安全 Skill': 'Review / test / security Skills',
  '功能测试结果': 'Functional test results',
  '代码静态检查结果': 'Static analysis results',
  'Agent Review 结果': 'Agent Review results',
  '历史综合检视结果': 'Historical combined review results',
  '安全结果': 'Security results',
  '交付 PR／提交': 'Delivered PR / commit',
  // 产物
  'PRD：目标、范围、规则、验收标准、待确认项': 'PRD: goals, scope, rules, acceptance criteria, open items',
  '软件设计文档': 'Software design document',
  'GitHub 代码 PR 或提交': 'GitHub code PR or commit',
  '单元测试及结果': 'Unit tests and results',
  '功能测试报告': 'Functional test report',
  '代码静态检查工具报告': 'Static analysis tool report',
  'Agent Review 报告': 'Agent Review report',
  '历史综合代码检视报告': 'Historical combined code review report',
  '安全报告': 'Security report',
  '发现问题与复测结果（无问题也需明确记录）': 'Issues found and retest results (record it even when there are none)',
  'Owner 验收结论或退回原因': 'Owner acceptance decision or reason for sending back',
  '交付清单：引用本需求已登记的产物版本': 'Delivery manifest: the artifact versions registered for this requirement',
  // 完成标准
  '需求边界明确，PRD 覆盖目标、范围、规则、验收标准及待确认项': 'The requirement boundary is clear and the PRD covers goals, scope, rules, acceptance criteria and open items',
  'PRD 分层标注已确认与待确认事项：影响开发的关键事项均给出确认依据（确认人、时间或来源），待确认事项注明责任方且未按已确认处理': 'The PRD separates confirmed and open items: every item that affects development cites its basis (confirmer, time or source), and open items name an owner and are not treated as confirmed',
  '实现与已确认 PRD 对应': 'The implementation matches the confirmed PRD',
  '设计、代码 PR／提交和单元测试结果可追踪至同一代码版本': 'The design, the code PR/commit and the unit-test results trace to the same code version',
  '本次改动必要范围的单元测试已实际执行通过，无未执行的必要测试；编译不能代替测试': 'Unit tests for the required scope of this change actually ran and passed, with no required test left unexecuted; compiling is not a substitute',
  '必要单元测试通过后具备验证条件，其余明确非必需的限制已说明': 'Verification can start once the required unit tests pass, and any other explicitly optional limitation is stated',
  '功能、静态工具、Agent Review 与安全检查范围齐全，实际执行与预置来源明确': 'Functional, static analysis, Agent Review and security checks are all covered, with actual runs and preset sources distinguished',
  '阻塞交付的问题已处理，并保留问题与复测依据': 'Issues blocking delivery are resolved, with the issue and retest evidence kept',
  '本轮全部检查通过且指向待验收的同一代码版本': 'Every check in this round passed and points to the same code version awaiting acceptance',
  'Owner 对照验收依据明确通过或退回；CLI 不能代替确认': 'The Owner explicitly accepts or sends back against the acceptance basis; a CLI cannot substitute for that decision',
  // 节点输入槽位与来源说明
  '任务原始需求': 'Task original requirement',
  '本需求验证知识': 'Verification knowledge for this requirement',
  '验收口径与清单': 'Acceptance criteria and checklist',
  '节点知识': 'Node knowledge',
  '设计与开发 Skill': 'Design and development Skill',
  '验收 Skill': 'Acceptance Skill',
  '节点 Skill': 'Node Skill',
  'Talents 已发布知识 · Teams 节点筛选': 'Talents published knowledge · filtered by the Teams node',
  'Teams 节点知识配置': 'Teams node knowledge configuration',
  'Talent 节点知识': 'Talent node knowledge',
  'Talent 节点 Skill': 'Talent node Skill',
  '历史采用知识 · 当前节点相关部分': 'Historically adopted knowledge · the part relevant to this node',
  '历史采用 Skill · 当前节点相关部分': 'Historically adopted Skill · the part relevant to this node',
  // 导入快照里的状态（上游 Teams 的中文值）
  '未开始': 'Not started',
  '待开始': 'Not started',
  '待开展': 'Not started',
  '进行中': 'In progress',
  '已完成': 'Completed',
  '已确认': 'Confirmed',
  '已提交': 'Submitted',
  '已形成场景': 'Scenario formed',
  '已验收': 'Accepted',
  '待验收': 'Awaiting acceptance',
  '未执行': 'Not executed',
  '未提交': 'Not submitted',
  '仅有测试准备': 'Test preparation only',
  '来源未提供': 'Source not provided',
  '待 C 评审': 'Pending C review',
  '待 A 确认': 'Pending A confirmation',
  '待评审': 'Pending review',
  '阻塞': 'Blocked',
  '成果待确认': 'Result awaiting confirmation',
  '企业测试资产插件': 'Enterprise test asset plugin',
  '用例定义': 'Test case definition',
};

/** 合同标签按原文查表；没有英文的（例如用户自定义）保持原样。 */
export const labelText = (text: string): string => {
  if (currentLocale() !== 'en') return text;
  const exact = en[text];
  if (exact) return exact;
  // 服务端会把名称和状态拼成「名称（状态）」，拆开各自查表，避免组合串漏翻。
  const composed = /^(.*)（(.*)）$/.exec(text);
  return composed ? `${labelText(composed[1])} (${labelText(composed[2])})` : text;
};

/** 服务端下发的固定说明句：按原文找词条，找不到就原样显示。 */
const serverNotes: Record<string, string> = {
  '按原生对话轮次展示用户输入和模型可见回复；敏感凭据已隐藏。': 'tsa.nativeNote',
  '尚未配置项目工作区，请到项目概览设置独立仓库路径': 'tools.noWorkspace',
  '尚未配置项目工作区，请到项目概览的工作区设置中指定独立仓库路径': 'tools.noWorkspace',
  '尚未配置项目工作区，请在项目概览设置独立仓库路径。': 'tools.noWorkspace',
};
export const knownServerNote = (text: string): string | undefined => currentLocale() === 'en' ? serverNotes[text] : undefined;
/** 服务端文案按原文查表；查不到就原样显示（内部的错误原文按 D4 保留）。 */
export const serverText = (text: string | undefined): string | undefined => {
  if (!text) return text;
  const key = knownServerNote(text);
  return key ? currentT(key as MessageKey) : text;
};
