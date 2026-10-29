/** Vendored from iCode Teams framework/client/ui/src/contracts/ui.ts
 * Source revision: d3deae7ea4e47026925ccbd06ab6eec03f4648c7.
 * Imports are local; index.ts injects demo module loading/source labeling.
 * configuration-editor.ts labels read-only demo data explicitly. Layout, controls and interaction remain upstream.
 */
import type { BrowserObservation } from './browser-observation.js'
import type { UiNotifications } from './notifications.js'
import { vt } from '../i18n.js'
export const UI_API_VERSION = '2' as const
/** API 3 additionally requires the host's browser observation capability at mount. */
export const UI_OBSERVATION_API_VERSION = '3' as const
/** API 4 requires scoped host notifications as well as browser observation. */
export const UI_NOTIFICATION_API_VERSION = '4' as const
/** API 5 permits declared navigation groups and binds browser registration to the manifest. */
export const UI_NAVIGATION_API_VERSION = '5' as const
export const UI_REGION_API_VERSION = '6' as const
export const declaresUiContributions = (version: unknown) => version === UI_NAVIGATION_API_VERSION || version === UI_REGION_API_VERSION
export const SUPPORTED_UI_API_VERSIONS = [UI_API_VERSION, UI_OBSERVATION_API_VERSION, UI_NOTIFICATION_API_VERSION, UI_NAVIGATION_API_VERSION, UI_REGION_API_VERSION] as const
export type UiApiVersion = typeof SUPPORTED_UI_API_VERSIONS[number]
export function isSupportedUiApi(value: unknown): value is UiApiVersion {
  return SUPPORTED_UI_API_VERSIONS.some(version => version === value)
}

export const ui = {
  form: 'ui-form',
  field: 'ui-field',
  actions: 'ui-actions',
  note: 'ui-note',
  empty: 'ui-empty',
  section: 'ui-section',
  button: 'ui-button',
  buttonPrimary: 'ui-button-primary',
  buttonSecondary: 'ui-button-secondary',
  buttonDanger: 'ui-button-danger',
  list: 'ui-list',
  stack: 'ui-stack',
  table: 'ui-table',
  dialog: 'ui-dialog',
  dialogCard: 'ui-dialog-card',
  /** 消息条目 tone 节点/标签与筛选 chips（数据开放 agent-session 消息流消费者）：
   *  tone 映射：输入=主题紫、思考=警示琥珀、输出=成功绿、工具=信息蓝、未识别=中性。 */
  nodeInput: 'ui-node-input',
  nodeThinking: 'ui-node-thinking',
  nodeOutput: 'ui-node-output',
  nodeTool: 'ui-node-tool',
  nodeUnknown: 'ui-node-unknown',
  msgKind: 'ui-msg-kind',
  kindInput: 'ui-kind-input',
  kindThinking: 'ui-kind-thinking',
  kindOutput: 'ui-kind-output',
  kindTool: 'ui-kind-tool',
  kindUnknown: 'ui-kind-unknown',
  msgTitle: 'ui-msg-title',
  msgPreview: 'ui-msg-preview',
  msgBody: 'ui-msg-body',
  msgBodyMono: 'ui-msg-body-mono',
  /** 类型筛选 chips：未选中=中性描边，选中用 chipOn{Primary|Warning|Success|Info|Neutral} 按 tone 着色。 */
  chip: 'ui-chip',
  chipOnPrimary: 'ui-chip-on-primary',
  chipOnWarning: 'ui-chip-on-warning',
  chipOnSuccess: 'ui-chip-on-success',
  chipOnInfo: 'ui-chip-on-info',
  chipOnNeutral: 'ui-chip-on-neutral',
  /** 消息视图深化（P2）：搜索框与命中高亮；轮次分隔行；复制小按钮。 */
  searchInput: 'ui-search-input',
  mark: 'ui-mark',
  turnHead: 'ui-turn-head',
  msgCopy: 'ui-msg-copy',
  /** 对话框承载"全量管理界面"时的加宽卡片（比确认框宽，内部仍可滚动）。 */
  dialogWide: 'ui-dialog-wide',
  /** 对话框顶部标题行 / 底部动作行（动作行右对齐）。 */
  dialogHead: 'ui-dialog-head',
  dialogFoot: 'ui-dialog-foot',
  /** 页面标题行（左标题 / 右操作区）。 */
  panelHead: 'ui-panel-head',
  /** 页面右上角的操作区（靠右排布，用于放"管理"入口这类不在主链路上的动作）。 */
  toolbarEnd: 'ui-toolbar-end',
  /** 会话卡标题行：标题 + 同步状态徽标同排。 */
  sessionHead: 'ui-session-head',
  /** 同步状态徽标：四种状态各用一种底色，配色见 design-system.ts。 */
  status: 'ui-status',
  statusSynced: 'ui-status-synced',
  statusSyncing: 'ui-status-syncing',
  statusUnreported: 'ui-status-unreported',
  statusUnknown: 'ui-status-unknown',
  /** 两栏布局：主栏（主链路内容）+ 侧栏（概览与依赖）。 */
  split: 'ui-split',
  splitMain: 'ui-split-main',
  splitSide: 'ui-split-side',
  /**
   * 归因判决徽标（03 §13.6.5）：**不复用 `ui.status*`**——那是同步状态语义，
   * 复用会把「已归因」误读成「已同步」。徽标只表达判决，来源由行标签承担。
   */
  verdict: 'ui-verdict',
  verdictCaused: 'ui-verdict-caused',
  verdictPartial: 'ui-verdict-partial',
  verdictNone: 'ui-verdict-none',
  verdictUndetermined: 'ui-verdict-undetermined',
  /** 行级来源标签：两种来源（提交 / 本地）同形，只有文案与配色不同；未归因用 tagMuted。 */
  tag: 'ui-tag',
  tagEvidence: 'ui-tag-evidence',
  tagLocal: 'ui-tag-local',
  tagMuted: 'ui-tag-muted',
  /** 逐行视图：等宽、行号列固定宽、内容列可横向滚动。 */
  lineList: 'ui-line-list',
  lineRow: 'ui-line-row',
  lineGutter: 'ui-line-gutter',
  lineBody: 'ui-line-body',
} as const

export interface ConfirmActionOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

/**
 * 插件世界的确认框（DOM 实现，样式由 design-system.ts 的契约类提供）。
 * 插件禁止使用原生 confirm/alert；危险操作传 danger: true。
 */
export function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false)
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = ui.dialog
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    const card = document.createElement('div')
    card.className = ui.dialogCard
    const title = document.createElement('h3')
    title.textContent = options.title
    const message = document.createElement('p')
    message.textContent = options.message
    const actions = document.createElement('div')
    actions.className = ui.actions
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = ui.button
    cancel.textContent = options.cancelText ?? vt('common.cancel')
    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.className = options.danger ? ui.buttonDanger : ui.buttonPrimary
    confirm.textContent = options.confirmText ?? vt('common.confirm')
    actions.append(cancel, confirm)
    card.append(title, message, actions)
    overlay.append(card)
    const done = (value: boolean) => {
      overlay.remove()
      removeEventListener('keydown', onKey, true)
      resolve(value)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') done(false) }
    cancel.onclick = () => done(false)
    confirm.onclick = () => done(true)
    addEventListener('keydown', onKey, true)
    document.body.append(overlay)
    confirm.focus()
  })
}

/** A startup contribution mounts before the workbench assembles; calling continue() releases it. Idempotent.
 *  Only the live instance may release: the host ignores continue() from an aborted, replaced,
 *  or not-yet-mounted instance, and from a mount that fails synchronously. Replacement revokes the
 *  old instance's eligibility at the runtime registry the moment the new fiber becomes active,
 *  before the old interface is unmounted. */
export interface UiStartupContext extends ObservedUiMountContext {
  continue(): void
}

/** One mount owns its work until signal abort; late callbacks are ignored by the host. */
export interface UiPageContext {
  teamId?: string
  projectId?: string
  objectId?: string
  tab?: string
  device: 'local'
  preview: boolean
}
/** Presentation-only region composition. Input/intents are structured UI data, never business RPC.
 * The provider owns authorization for any real operation. Each child has its own abort/editor lease.
 * The shell mounts optional navigation.<pageId> regions below that page's existing sidebar entry;
 * labels, child routes and selection remain with the provider, and competing providers fail explicitly.
 */
export interface UiRegionRequest {
  target: string
  context: UiPageContext
  input?: unknown
  onIntent?(intent: unknown): void
}
export interface UiRegions { mount(container: HTMLElement, request: UiRegionRequest): () => void }
export interface UiAppearance { mode(): 'light' | 'dark'; subscribe(listener: () => void): () => void }
export interface UiMountContext extends UiPageContext {
  appearance?: UiAppearance
  regions?: UiRegions
  regionInput?: unknown
  emitIntent?(intent: unknown): void
  /** API 2 does not require this capability; API 3 does. */
  observation?: BrowserObservation
  /** Required when the plugin declares UI API 4. */
  notifications?: UiNotifications
  contributionId: string
  signal: AbortSignal
  setDirty(dirty: boolean): void
  reportError(error: unknown): void
}
export interface ObservedUiMountContext extends UiMountContext { observation: BrowserObservation }
export interface NotifiedUiMountContext extends ObservedUiMountContext { notifications: UiNotifications }
export type UiMount = (container: HTMLElement, context: ObservedUiMountContext) => void | (() => void)

/** A plugin opts in only its draft controls. Search/filter controls must not be selected.
 * Capture before saving; acknowledge only after success, preserving edits made during the request.
 */
export function trackUiDrafts(container: HTMLElement, context: UiMountContext, selector: string) {
  const changed = new Map<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, string>()
  const value = (field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type) ? String(field.checked) : field.value
  const report = () => context.setDirty(changed.size > 0)
  const input = (event: Event) => {
    const field = event.target
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || !field.matches(selector)) return
    changed.set(field, value(field)); report()
  }
  container.addEventListener('input', input, { signal: context.signal })
  container.addEventListener('change', input, { signal: context.signal })
  return {
    capture(scope: HTMLElement = container) {
      const saved = [...changed].filter(([field]) => scope.contains(field))
      return () => { for (const [field, text] of saved) if (changed.get(field) === text) changed.delete(field); report() }
    },
    discard(scope: HTMLElement = container) { for (const field of changed.keys()) if (scope.contains(field)) changed.delete(field); report() },
  }
}
