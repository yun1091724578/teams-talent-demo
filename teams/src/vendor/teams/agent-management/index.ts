/** Vendored from iCode Teams business/domain/agent-management/src/client/ui/index.ts
 * Source revision: d3deae7ea4e47026925ccbd06ab6eec03f4648c7.
 * Imports are local; index.ts injects demo module loading/source labeling.
 * configuration-editor.ts labels read-only demo data explicitly. Layout, controls and interaction remain upstream.
 */
import { mountConfigurationEditor } from './configuration-editor.js'
import { UI_OBSERVATION_API_VERSION, ui, type ObservedUiMountContext } from './ui-contract.js'
import { AGENT_UI_API, agentCategories, type AgentCategory, type AgentConfigurationController, type AgentUiAdapter, type AgentUiInstance, type AgentUiModule, type AgentUiRegistration } from './agent-ui-contract.js'
import { vt } from '../i18n.js'

/** Demo integration seam: the host supplies locally bundled adapters and an honest source label. */
export interface ManagementMountOptions {
  loadModule(module: string): Promise<AgentUiModule & { version: string }>
  configurationOwnerLabel: string
}

export function mount(container: HTMLElement, context: ObservedUiMountContext, options: ManagementMountOptions) {
  const abort = new AbortController()
  context.signal.addEventListener('abort', () => abort.abort(), { once: true })
  container.id = 'agent-management'; container.className = ui.list
  container.innerHTML = `<p data-status class="${ui.note}" role="status"></p>
    <section data-detail><header data-object class="${ui.actions}"><div data-object-name><h2><button data-all class="${ui.button}" aria-label="${vt('am.page.switchAgent')}" aria-expanded="false"><span data-title>${vt('am.page.loading')}</span> ▾</button></h2><span data-object-state></span><button data-update class="${ui.button}" hidden></button><button data-install class="${ui.buttonPrimary}" hidden></button><button data-refresh class="${ui.button}" aria-label="${vt('am.page.checkStatus')}">↻</button><button data-add class="${ui.button}" aria-label="${vt('am.page.addAgent')}">＋</button><button data-instance-settings class="${ui.button}" aria-label="${vt('am.page.instanceSettings')}">⚙</button></div><p data-summary class="${ui.note}"></p></header>
    <div data-all-panel hidden class="${ui.section}"><input data-search type="search" aria-label="${vt('am.page.searchAgent')}" placeholder="${vt('am.page.searchPlaceholder')}"><div data-results></div></div>
    <section data-startup hidden class="${ui.section}"><h3>${vt('am.page.launchInTerminal')}</h3><p data-use-hint class="${ui.note}"></p><div data-launch-form><label class="${ui.field}">${vt('am.page.workingDirectory')}<div data-cwd-row><input data-cwd aria-label="${vt('am.page.workingDirectory')}"><button data-directory class="${ui.button}" aria-label="${vt('am.page.chooseDirectory')}">${vt('am.page.chooseFolder')}</button></div></label><label data-terminal-field class="${ui.field}">${vt('am.page.terminal')}<select data-terminal aria-label="${vt('am.page.terminal')}"></select></label><button data-start class="${ui.buttonPrimary}">${vt('am.page.start')}</button></div><div data-launch-guide hidden><pre data-launch-instructions></pre><button data-launch-copy class="${ui.button}">${vt('am.page.copyCommand')}</button></div></section>
    <section data-config-summary hidden class="${ui.section}"><h3>${vt('am.page.configuration')}</h3><div data-config-entries></div></section></section>
    <dialog data-config-dialog aria-labelledby="agent-config-title"><header data-config-header><div><div data-config-tool-wrap><h2 id="agent-config-title"><button data-config-tool type="button" aria-label="${vt('am.page.switchConfigTool')}" aria-expanded="false"><span data-config-tool-title></span><span data-config-tool-arrow aria-hidden="true">▾</span></button></h2><div data-config-tool-list hidden aria-label="${vt('am.page.availableTools')}"></div></div><p data-config-owner class="${ui.note}"></p></div><button data-config-close class="${ui.button}" aria-label="${vt('am.page.closeConfiguration')}">×</button></header><div data-config-close-confirm hidden class="${ui.actions}"><span>${vt('am.page.unsavedDraft')}</span><button data-config-keep class="${ui.button}">${vt('am.page.keepEditing')}</button><button data-config-leave class="${ui.button}">${vt('am.page.closeKeepDraft')}</button></div><p data-config-switch-status class="${ui.note}" role="status" hidden></p><div data-config-body></div></dialog>
    <dialog data-maintenance-dialog aria-label="${vt('am.page.instanceSettings')}"><header class="${ui.actions}"><h2>${vt('am.page.instanceSettings')}</h2><button data-maintenance-close class="${ui.button}" aria-label="${vt('am.page.closeInstanceSettings')}">×</button></header><div data-maintenance-body></div><details data-instance-details><summary>${vt('am.page.instanceInfo')}</summary><div data-maintenance-facts></div></details></dialog>
    <dialog data-add-panel aria-label="${vt('am.page.addAgent')}"><header class="${ui.actions}"><h2>${vt('am.page.addAgent')}</h2><button data-add-close class="${ui.button}" aria-label="${vt('am.page.closeAddAgent')}">×</button></header><nav data-adapter-picker class="${ui.actions}"></nav><div data-adoption-body></div></dialog>`
  const style = document.createElement('style')
  style.textContent = `#agent-management{width:100%;max-width:none;min-width:0;grid-template-columns:minmax(0,1fr);container-type:inline-size;box-sizing:border-box;gap:var(--ui-space-2)}#agent-management [hidden]{display:none!important}#agent-management h2,#agent-management h3{margin:0}#agent-management h2{font-size:var(--ui-font-size-h3)}#agent-management p{margin:var(--ui-space-1) 0}#agent-management [data-status]:empty{display:none}#agent-management [data-object]{display:block;margin:var(--ui-space-2) 0}#agent-management [data-object-name]{display:flex;align-items:center;gap:var(--ui-space-2);flex-wrap:wrap}#agent-management [data-all]{border:0;background:transparent;padding:0;font-size:var(--ui-font-size-h3);font-weight:700;color:var(--ui-color-text)}#agent-management [data-object-state]{font-size:var(--ui-font-size-note);color:var(--ui-color-muted);border:1px solid var(--ui-color-border);border-radius:var(--ui-radius);padding:3px var(--ui-space-2)}#agent-management [data-object-name]>button{width:30px;height:30px;min-height:30px;padding:0}#agent-management [data-object-name]>[data-update]{width:auto;padding:0 var(--ui-space-2);color:var(--ui-color-primary)}#agent-management [data-summary]{color:var(--ui-color-muted)}#agent-management [data-all-panel]{position:absolute;z-index:10;width:min(340px,calc(100vw - 32px));padding:var(--ui-space-2);background:var(--ui-color-surface);box-shadow:var(--ui-shadow-block)}#agent-management [data-search]{box-sizing:border-box;width:100%}#agent-management [data-results]{max-height:320px;overflow:auto;display:grid;gap:var(--ui-space-1);margin-top:var(--ui-space-2)}#agent-management [data-results] button{display:grid;text-align:left;padding:var(--ui-space-2);border:0}#agent-management [data-results] small{color:var(--ui-color-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#agent-management [data-startup],#agent-management [data-config-summary]{padding:var(--ui-space-2) var(--ui-space-3);margin-bottom:var(--ui-space-2)}#agent-management [data-launch-form]{display:flex;flex-wrap:wrap;align-items:center;gap:var(--ui-space-3);margin:var(--ui-space-2) 0}#agent-management [data-launch-form] label{flex:1 1 400px;min-width:0;display:grid;grid-template-columns:80px minmax(0,1fr);align-items:center;gap:var(--ui-space-2);margin:0}#agent-management [data-launch-form] [data-terminal-field]{flex:0 1 240px;grid-template-columns:auto minmax(0,1fr)}#agent-management [data-cwd-row]{display:flex;gap:var(--ui-space-2);min-width:0}#agent-management [data-cwd-row] input{flex:1;min-width:0}#agent-management [data-launch-form] input,#agent-management [data-launch-form] select{box-sizing:border-box;width:100%;height:32px;padding-top:0;padding-bottom:0}#agent-management [data-start]{height:32px;min-height:32px;white-space:nowrap;padding-top:0;padding-bottom:0}#agent-management [data-directory]{white-space:nowrap;min-height:32px;padding-top:0;padding-bottom:0}#agent-management [data-config-entries]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-space-2);margin-top:var(--ui-space-2)}#agent-management [data-config-entry]{min-width:0;overflow-wrap:anywhere;display:flex;align-items:center;gap:var(--ui-space-2);text-align:left;padding:var(--ui-space-2);min-height:64px;background:var(--ui-color-surface);border:1px solid var(--ui-color-border);border-radius:var(--ui-radius);color:var(--ui-color-text);font:inherit;cursor:pointer}#agent-management [data-config-entry]>span:first-child{min-width:0;display:grid;gap:var(--ui-space-1);flex:1}#agent-management [data-config-entry] small{color:var(--ui-color-muted);font-size:var(--ui-font-size-note)}#agent-management [data-config-entry]>span:last-child{flex-shrink:0;color:var(--ui-color-primary)}#agent-management dialog{box-sizing:border-box;background:var(--ui-color-surface);color:var(--ui-color-text);border:1px solid var(--ui-color-border);border-radius:var(--ui-radius);padding:var(--ui-space-3);box-shadow:var(--ui-shadow-block)}#agent-management dialog::backdrop{background:rgb(0 0 0 / 32%)}#agent-management [data-config-dialog]{width:min(1320px,calc(100vw - 64px));height:min(840px,calc(100dvh - 64px));max-width:none;max-height:none;overflow:hidden}#agent-management [data-config-dialog][open]{display:flex;flex-direction:column;gap:var(--ui-space-2)}#agent-management [data-config-header]{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--ui-color-divider);padding-bottom:var(--ui-space-2)}#agent-management [data-config-header]>div{display:flex;align-items:center;gap:var(--ui-space-3);flex-wrap:wrap}#agent-management [data-config-body]{flex:1;min-height:0}#agent-management [data-config-body]>section{margin:0;border:0;padding:0;background:transparent;height:100%}#agent-management [data-config-close-confirm]{background:var(--ui-color-surface-sunken);padding:var(--ui-space-2)}#agent-management [data-maintenance-dialog],#agent-management [data-add-panel]{width:min(1100px,calc(100vw - 48px));max-height:calc(100dvh - 48px);overflow:auto}#agent-management [data-maintenance-dialog]>header,#agent-management [data-add-panel]>header{justify-content:space-between;margin-bottom:var(--ui-space-3)}#agent-management [data-maintenance-facts]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-space-2);margin-bottom:var(--ui-space-3)}#agent-management [data-maintenance-facts] p{overflow-wrap:anywhere}#agent-management [data-adapter-picker]{margin-bottom:var(--ui-space-2)}@container(max-width:620px){#agent-management [data-launch-form] label{flex-basis:100%;grid-template-columns:1fr}#agent-management [data-launch-form] [data-terminal-field]{flex:1 1 180px;grid-template-columns:auto minmax(0,1fr)}#agent-management [data-summary]{overflow-wrap:anywhere}}@media(max-width:760px){#agent-management [data-maintenance-facts]{grid-template-columns:1fr}#agent-management [data-launch-form] label{grid-template-columns:65px minmax(0,1fr)}#agent-management [data-config-dialog]{width:calc(100vw - 16px);height:calc(100dvh - 16px);padding:var(--ui-space-2)}}`
  style.textContent += '#agent-management [data-config-tool-wrap]{position:relative}#agent-management [data-config-tool]{display:inline-flex;align-items:center;gap:var(--ui-space-2);font:inherit;font-weight:inherit;color:inherit;background:transparent;border:0;padding:4px 6px;margin-left:-6px;min-height:0;width:auto;border-radius:var(--ui-radius);cursor:pointer}#agent-management [data-config-tool]:hover{background:var(--ui-color-surface-sunken)}#agent-management [data-config-tool]:focus:not(:focus-visible){outline:none;box-shadow:none}#agent-management [data-config-tool]:focus-visible{outline:2px solid var(--ui-color-ring);outline-offset:2px}#agent-management [data-config-tool-arrow]{font-size:var(--ui-font-size-note);color:var(--ui-color-muted)}#agent-management [data-config-tool-list]{position:absolute;top:calc(100% + 8px);left:0;z-index:20;box-sizing:border-box;width:300px;max-width:calc(100vw - 64px);max-height:320px;overflow:auto;padding:var(--ui-space-1);background:var(--ui-color-surface);border:1px solid var(--ui-color-border);border-radius:var(--ui-radius);box-shadow:var(--ui-shadow-block);display:grid;gap:var(--ui-space-1)}#agent-management [data-config-tool-list] button{display:flex;justify-content:space-between;text-align:left;width:100%;border:0;white-space:normal;overflow-wrap:anywhere}#agent-management [data-config-tool-list] button[aria-current=true]{color:var(--ui-color-primary);background:var(--ui-color-surface-sunken)}'
  style.textContent += '#agent-management [data-object-name]>[data-install]{width:auto;height:30px;min-height:30px;padding:0 var(--ui-space-2);font-size:var(--ui-font-size-note)}'
  style.textContent += '#agent-management{display:block}#agent-management>header{margin-bottom:var(--ui-space-3)}#agent-management [data-status]{overflow-wrap:anywhere}#agent-management [data-all-panel]{box-sizing:border-box;max-width:100%;border:1px solid var(--ui-color-border);border-radius:var(--ui-radius)}#agent-management [data-config-entry]:disabled{cursor:default}#agent-management [data-config-entry]>span:last-child{white-space:nowrap}@container(max-width:620px){#agent-management [data-config-entries]{grid-template-columns:1fr}#agent-management [data-launch-form] label{grid-template-columns:1fr}}'
  container.append(style)
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => container.querySelector<T>(selector)!
  const status = get('[data-status]')
  const adapters = new Map<string, { registration: AgentUiRegistration; adapter: AgentUiAdapter; module: string }>()
  const instances = new Map<string, { instance: AgentUiInstance; adapterId: string }>()
  const configurations = new Map<string, { controller: AgentConfigurationController; panel: HTMLElement }>()
  const cwdDrafts = new Map<string, string>()
  const uncertainLaunches = new Set<string>()
  const clearGuide = () => { get('[data-launch-guide]').hidden = true; get('[data-launch-instructions]').textContent = '' }
  const dirty = new Map<string, boolean>()
  let refreshGeneration = 0, selectionExplicit = false
  let selected: string | undefined, refreshPending = false, operationPending = false, refreshAgain = false
  let configurationKey: string | undefined, configurationOpener: HTMLElement | undefined, configurationCategory: AgentCategory = 'agent'
  const maintenance = new Map<string, { panel: HTMLElement; dispose: () => void }>()
  const adoption = new Map<string, { panel: HTMLElement; dispose: () => void }>()
  const childContext = (key: string): ObservedUiMountContext => ({ ...context, signal: abort.signal, setDirty(value) { dirty.set(key, value); context.setDirty([...dirty.values()].some(Boolean)) } })
  const call = async <T>(command: Record<string, unknown>): Promise<T> => {
    const action = String(command.action)
    return context.observation.observeBrowserOperation('agent.management.request', { action }, async operation => {
      const { response, value } = await context.observation.tracedJson<{ result: T; error?: string }>('agent.management.http', '/api/bundles/agent-management/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60_000)]) })
      operation.event('agent.management.response', { action, status: response.status })
      if (!response.ok) throw new Error(value.error ?? vt('am.msg.requestFailed', { status: response.status }))
      return value.result
    })
  }
  const button = (label: string, action: () => void) => { const value = document.createElement('button'); value.type = 'button'; value.className = ui.button; value.textContent = label; value.addEventListener('click', action, { signal: abort.signal }); return value }
  const current = () => selected ? instances.get(selected)?.instance : undefined
  const activeConfiguration = () => configurationKey ? configurations.get(configurationKey)?.controller : undefined
  const hasDrafts = () => [...configurations.values()].some(item => item.controller.hasDrafts())
  const pending = (value: boolean) => { operationPending = value; for (const item of container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('[data-startup] input,[data-startup] select,[data-startup] button')) item.disabled = value; if (!value) drawStartup() }
  const run = async (work: () => Promise<void>) => { if (operationPending || abort.signal.aborted) return; if (selected) selectionExplicit = true; pending(true); try { await work() } catch (error) { if (!abort.signal.aborted) status.textContent = vt('am.msg.operationFailed', { detail: error instanceof Error ? error.message : String(error) }) } finally { if (!abort.signal.aborted) pending(false) } }
  const drawPicker = () => {
    const query = get<HTMLInputElement>('[data-search]').value.toLocaleLowerCase()
    get('[data-results]').replaceChildren(...[...instances].filter(([, item]) => `${item.instance.name} ${item.instance.path ?? ''} ${item.instance.version ?? ''}`.toLocaleLowerCase().includes(query)).map(([key, item]) => {
      const control = button('', () => {
        if (hasDrafts() && key !== selected) { status.textContent = vt('am.msg.draftsBeforeSwitch'); return }
        void run(async () => { await item.instance.activateSelected?.(); selected = key; selectionExplicit = true; clearGuide(); get('[data-all-panel]').hidden = true; get('[data-all]').setAttribute('aria-expanded', 'false'); draw() })
      })
      const title = document.createElement('strong'), note = document.createElement('small'); title.textContent = `${item.instance.name} · ${item.instance.state}`; note.textContent = item.instance.path ?? item.instance.kind; control.append(title, note); control.setAttribute('aria-current', String(selected === key)); return control
    }))
    if (!get('[data-results]').childElementCount) get('[data-results]').textContent = vt('am.msg.noMatchingAgent')
  }
  const drawStartup = () => {
    const instance = current(), startup = instance?.startup
    get('[data-startup]').hidden = !startup
    if (!startup) return
    get<HTMLInputElement>('[data-cwd]').value = selected && cwdDrafts.has(selected) ? cwdDrafts.get(selected)! : startup.cwd
    const terminal = get<HTMLSelectElement>('[data-terminal]'); terminal.replaceChildren(...startup.terminals.map(item => Object.assign(document.createElement('option'), { value: item.id, textContent: item.name }))); terminal.value = startup.selectedTerminal ?? ''
    const unknown = selected && uncertainLaunches.has(selected) ? vt('am.msg.uncertainLaunch') : undefined
    get('[data-use-hint]').textContent = unknown ?? startup.disabledReason ?? startup.hint
    const start = get<HTMLButtonElement>('[data-start]'); start.textContent = startup.launchLabel; start.disabled = operationPending || !!startup.disabledReason || !!unknown; start.title = startup.disabledReason ?? ''
    get<HTMLSelectElement>('[data-terminal]').disabled = operationPending || startup.terminals.length === 0
  }
  const draw = () => {
    if (abort.signal.aborted) return
    const instance = current()
    get('[data-title]').textContent = instance?.name ?? (refreshPending ? vt('am.msg.discovering') : vt('am.msg.noInstances'))
    get('[data-all]').setAttribute('aria-label', vt('am.msg.switchAgentCurrent', { name: instance?.name ?? vt('am.msg.none') }))
    get('[data-object-state]').textContent = instance?.state ?? ''
    get('[data-object-state]').hidden = !instance || !!instance.installLabel
    const update = get<HTMLButtonElement>('[data-update]'); update.hidden = !instance?.updateLabel; update.textContent = instance?.updateLabel ?? ''; update.disabled = operationPending
    const install = get<HTMLButtonElement>('[data-install]'); install.hidden = !instance?.installLabel; install.textContent = instance?.installLabel ?? ''; install.disabled = operationPending
    get('[data-summary]').textContent = instance?.identity ?? ''
    get<HTMLButtonElement>('[data-instance-settings]').disabled = !instance
    get('[data-config-summary]').hidden = !instance
    drawStartup(); drawPicker()
    get('[data-config-entries]').replaceChildren(...agentCategories.map(category => {
      const summary = instance?.categories.find(item => item.category === category)
      const card = button('', () => void run(() => openConfiguration(category, card))); card.dataset.configEntry = category; card.setAttribute('aria-label', vt('am.msg.manageConfig', { name: summary?.label ?? category }))
      const heading = document.createElement('span'), label = document.createElement('strong'), description = document.createElement('small'), count = document.createElement('span')
      label.textContent = summary?.label ?? (category === 'mcp' ? 'MCP' : category[0].toUpperCase() + category.slice(1)); description.textContent = summary?.unavailableReason ?? summary?.description ?? vt('am.msg.capabilityUnavailable'); heading.append(label, description); count.textContent = summary?.unavailableReason ? vt('am.msg.temporarilyUnavailable') : summary?.count === undefined ? vt('am.msg.configureArrow') : vt('am.msg.countArrow', { count: summary.count }); card.append(heading, count); card.disabled = !instance || !summary || !!summary.unavailableReason; return card
    }))
  }
  const drawConfigurationTools = () => {
    get('[data-config-tool-list]').replaceChildren(...[...instances].map(([key, item]) => {
      const name = `${item.instance.name}${[...instances.values()].filter(other => other.instance.name === item.instance.name).length > 1 ? ` · ${item.instance.path ?? item.instance.id}` : ''}`
      const control = button(name, () => switchConfigurationTool(key))
      control.disabled = !item.instance.categories.some(summary => !summary.unavailableReason)
      control.setAttribute('aria-current', String(key === selected))
      if (key === selected) { const check = document.createElement('span'); check.textContent = '✓'; check.setAttribute('aria-hidden', 'true'); control.append(check) }
      return control
    }))
  }
  const openConfiguration = async (category: AgentCategory, opener: HTMLElement, preserveCategory = false) => {
    if (!selected || !current()) return
    await current()!.activateSelected?.()
    configurationKey = selected; configurationOpener = opener
    let mounted = configurations.get(selected)
    const alreadyMounted = !!mounted
    if (!mounted) { const panel = document.createElement('section'); get('[data-config-body]').append(panel); const instance = current()!; const mount = childContext(`configuration:${selected}`); const controller = instance.configurationPort ? mountConfigurationEditor(panel, mount, instance.configurationPort, (container, context) => instance.mountConfiguration(container, context), {target: selected, client: {read:()=>call({action:'resource.list'}),isAcquired:async id=>(await call<{acquired:boolean}>({action:'resource.protected',id})).acquired,save:(definition,expectedRevision,id)=>call({action:'resource.save',definition,expectedRevision,...(id?{id}:{})}),bind:(application,expectedRevision)=>call({action:'resource.bind',application,expectedRevision}),unbind:(target,category,nativeId,expectedRevision)=>call({action:'resource.unbind',target,category,nativeId,expectedRevision})}}) : instance.mountConfiguration(panel, mount); mounted = { panel, controller }; configurations.set(selected, mounted) }
    for (const [key, item] of configurations) item.panel.hidden = key !== selected
    mounted.controller.setWorkingDirectory?.(get<HTMLInputElement>('[data-cwd]').value); mounted.controller.activate(); if (!preserveCategory || !alreadyMounted) { mounted.controller.selectCategory(category); configurationCategory = category }
    get('[data-config-tool-title]').textContent = vt('am.msg.configTitle', { name: current()!.name })
    drawConfigurationTools()
    get('[data-config-tool-list]').hidden = true; get('[data-config-tool]').setAttribute('aria-expanded', 'false')
    get('[data-config-header] h2').title = mounted.controller.getTargetLabel() ?? current()!.path ?? current()!.identity
    get('[data-config-owner]').textContent = options.configurationOwnerLabel
    get('[data-config-close-confirm]').hidden = true; get('[data-config-switch-status]').hidden = true; if (!get<HTMLDialogElement>('[data-config-dialog]').open) get<HTMLDialogElement>('[data-config-dialog]').showModal()
  }
  const closeConfiguration = () => {
    const controller = activeConfiguration(); if (controller?.isBusy()) return
    if (controller?.hasDrafts()) { get('[data-config-close-confirm]').hidden = false; return }
    get<HTMLDialogElement>('[data-config-dialog]').close(); configurationOpener?.focus()
  }
  const refresh = async () => {
    if (refreshPending) { refreshAgain = true; return }
    const generation = ++refreshGeneration
    refreshPending = true; get<HTMLButtonElement>('[data-refresh]').disabled = true
    const errors = new Map<string, string>(), loading = new Map<string, string>()
    const report = () => { status.textContent = [...errors.values(), ...(loading.size ? [vt('am.msg.reading', { names: [...loading.values()].join(vt('common.listSeparator')) })] : [])].join(vt('common.listSeparator')) }
    status.textContent = vt('am.msg.discoveringLocal'); draw()
    try {
      const [{ adapters: registrations }, { directories: savedDirectories }] = await Promise.all([
        call<{ adapters: AgentUiRegistration[] }>({ action: 'adapter.list' }),
        call<{ directories: Record<string, string> }>({ action: 'working-directory.list' }),
      ])
      const { response, value } = await context.observation.tracedJson<{ bundles: Array<{ id: string; version: string; module: string }> }>('agent.ui.modules', '/api/bundles/contributions', { signal: abort.signal })
      if (!response.ok) throw new Error(vt('am.msg.bundleListFailed', { status: response.status }))
      const publish = () => {
        const ordered = [...instances].sort((a, b) => registrations.findIndex(r => r.id === a[1].adapterId) - registrations.findIndex(r => r.id === b[1].adapterId))
        instances.clear(); for (const [key, item] of ordered) instances.set(key, item)
        if (!selected || !instances.has(selected) || !selectionExplicit) selected = instances.keys().next().value
        draw(); if (get<HTMLDialogElement>('[data-config-dialog]').open) drawConfigurationTools()
        report()
      }
      // Validate replacement protection before disposing any adapter module.
      if (registrations.some(registration => {const old = adapters.get(registration.id);return old && old.module !== value.bundles.find(bundle => bundle.id === registration.uiBundleId)?.module})
        && (hasDrafts() || [...dirty.values()].some(Boolean) || [...configurations.values()].some(item => item.controller.isBusy()))) throw new Error(vt('am.msg.pluginUpdated'))
      for (const registration of registrations) loading.set(registration.id, registration.name)
      report()
      await Promise.all(registrations.map(async registration => {
        try {
          const bundle = value.bundles.find(item => item.id === registration.uiBundleId)
          if (!bundle) throw new Error(vt('am.msg.bundleMissing', { name: registration.name }))
          let entry = adapters.get(registration.id)
          if (entry && entry.module !== bundle.module) {
            for (const [key, mounted] of configurations) if (instances.get(key)?.adapterId === registration.id) { mounted.controller.dispose(); mounted.panel.remove(); configurations.delete(key) }
            for (const [key, mounted] of maintenance) if (instances.get(key)?.adapterId === registration.id) { mounted.dispose(); mounted.panel.remove(); maintenance.delete(key) }
            for (const key of [registration.id, `${registration.id}:install`]) { const adoptionPanel = adoption.get(key); if (adoptionPanel) { adoptionPanel.dispose(); adoptionPanel.panel.remove(); adoption.delete(key) } }
            entry.adapter.dispose(); adapters.delete(registration.id); entry = undefined
          }
          if (!entry) {
            const module = await options.loadModule(bundle.module)
            if (abort.signal.aborted) return
            if (module.agentUiApi !== AGENT_UI_API || module.version !== bundle.version || typeof module.createAgentUi !== 'function') throw new Error(vt('am.msg.contractMismatch', { name: registration.name }))
            const adapter = module.createAgentUi({ ...childContext(`adapter:${registration.id}`), call: command => call({ action: 'adapter.call', adapterId: registration.id, command }), terminal: command => call(command), changed: () => void refresh() })
            entry = { adapter, registration, module: bundle.module }; adapters.set(registration.id, entry)
          }
          const loaded = await entry.adapter.loadInstances(), next = new Map<string, {instance: AgentUiInstance;adapterId: string}>()
          if (abort.signal.aborted || generation !== refreshGeneration) return
          for (const instance of loaded) {
            const key = JSON.stringify([registration.id, instance.id])
            if (next.has(key)) throw new Error(vt('am.msg.duplicateInstance'))
            const cwd = cwdDrafts.get(key) ?? savedDirectories[key]
            if (cwd !== undefined) { cwdDrafts.set(key, cwd); instance.startup.cwd = cwd }
            next.set(key, { instance, adapterId: registration.id })
          }
          for (const [key, item] of instances) if (item.adapterId === registration.id && !next.has(key) && configurations.get(key)?.controller.hasDrafts()) throw new Error(vt('am.msg.draftInstanceGone'))
          for (const [key, item] of instances) if (item.adapterId === registration.id) {
            if (!next.has(key)) { const mounted = configurations.get(key);mounted?.controller.dispose();mounted?.panel.remove();configurations.delete(key) }
            instances.delete(key)
          }
          for (const [key, item] of next) { instances.set(key, item);uncertainLaunches.delete(key) }
          loading.delete(registration.id);publish()
          for (const [key, item] of next) if (cwdDrafts.has(key) && item.instance.setWorkingDirectory) {
            configurations.get(key)?.controller.setWorkingDirectory?.(cwdDrafts.get(key)!)
            void item.instance.setWorkingDirectory(cwdDrafts.get(key)!, () => { if (!abort.signal.aborted && generation === refreshGeneration && instances.get(key)?.instance === item.instance) draw() })
              .catch(error => { if (!abort.signal.aborted && generation === refreshGeneration) { errors.set(registration.id, vt('am.msg.cwdReadFailed', { detail: error instanceof Error ? error.message : String(error) })); report() } })
          }
          for (const [key, item] of next) if (item.instance.refreshSummary) void item.instance.refreshSummary(() => {
            if (!abort.signal.aborted && generation === refreshGeneration && instances.get(key)?.instance === item.instance) draw()
          }).catch(error => {if (!abort.signal.aborted && generation === refreshGeneration) {errors.set(registration.id, vt('am.msg.summaryReadFailed', { name: registration.name, detail: error instanceof Error ? error.message : String(error) }));report()}})
        } catch (error) {
          if (!abort.signal.aborted) {
            const message = vt('am.msg.adapterReadFailed', { name: registration.name, detail: error instanceof Error ? error.message : String(error) })
            errors.set(registration.id, message)
            for (const item of instances.values()) if (item.adapterId === registration.id) {item.instance.state=vt('am.msg.readFailedState');item.instance.startup.disabledReason=message;for (const summary of item.instance.categories) summary.unavailableReason=message}
          }
        } finally { loading.delete(registration.id);if (!abort.signal.aborted) publish() }
      }))
      for (const [key, item] of instances) if (!registrations.some(r => r.id === item.adapterId)) {
        const mounted = configurations.get(key)
        if (mounted?.controller.hasDrafts()) {item.instance.state=vt('am.msg.pluginUninstalled');item.instance.startup.disabledReason=vt('am.msg.pluginUninstalledKept');errors.set(item.adapterId,vt('am.msg.draftPluginGone'));for (const summary of item.instance.categories) summary.unavailableReason=vt('am.msg.draftPluginGone')} else {mounted?.controller.dispose();mounted?.panel.remove();configurations.delete(key);instances.delete(key)}
      }
      publish()
    } catch (error) { if (!abort.signal.aborted) status.textContent = vt('am.msg.readFailed', { detail: error instanceof Error ? error.message : String(error) }) }
    finally { refreshPending = false; if (!abort.signal.aborted) { get<HTMLButtonElement>('[data-refresh]').disabled = false; draw(); if (refreshAgain) { refreshAgain = false; void refresh() } } }
  }
  get('[data-all]').addEventListener('click', () => { const panel = get('[data-all-panel]'); panel.hidden = !panel.hidden; get('[data-all]').setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) get('[data-search]').focus() }, { signal: abort.signal })
  container.ownerDocument.addEventListener('click', event => {
    if (!(event.target instanceof Node) || get('[data-all-panel]').contains(event.target) || event.target === get('[data-all]') || get('[data-all]').contains(event.target)) return
    get('[data-all-panel]').hidden = true; get('[data-all]').setAttribute('aria-expanded', 'false')
  }, { signal: abort.signal })
  get('[data-search]').addEventListener('input', drawPicker, { signal: abort.signal })
  const updateWorkingDirectory = async (key: string, cwd: string) => {
    const entry = instances.get(key)
    if (!entry) throw new Error(vt('am.msg.instanceGone'))
    await call({ action: 'working-directory.set', adapterId: entry.adapterId, instanceId: entry.instance.id, cwd })
    cwdDrafts.set(key, cwd)
    configurations.get(key)?.controller.setWorkingDirectory?.(cwd)
    await instances.get(key)?.instance.setWorkingDirectory?.(cwd, () => { if (selected === key) draw() })
  }
  get('[data-cwd]').addEventListener('change', () => {
    if (selected) void updateWorkingDirectory(selected, get<HTMLInputElement>('[data-cwd]').value).catch(error => { if (!abort.signal.aborted) status.textContent = vt('am.msg.cwdSaveFailed', { detail: error instanceof Error ? error.message : String(error) }) })
  }, { signal: abort.signal })
  get('[data-cwd]').addEventListener('input', () => { if (selected) { selectionExplicit = true; cwdDrafts.set(selected, get<HTMLInputElement>('[data-cwd]').value) }; clearGuide() }, { signal: abort.signal })
  get('[data-refresh]').addEventListener('click', () => void refresh(), { signal: abort.signal })
  get('[data-directory]').addEventListener('click', () => void run(async () => { const instance = current(), key = selected; if (!instance || !key) return; const result = await instance.startup.chooseDirectory(get<HTMLInputElement>('[data-cwd]').value); if (!result.cancelled && result.cwd !== undefined) { cwdDrafts.set(key, result.cwd); await updateWorkingDirectory(key, result.cwd); clearGuide(); if (selected === key) get<HTMLInputElement>('[data-cwd]').value = result.cwd } }), { signal: abort.signal })
  get('[data-terminal]').addEventListener('change', () => void run(async () => { const instance = current(); if (!instance) return; await instance.startup.selectTerminal(get<HTMLSelectElement>('[data-terminal]').value); await refresh() }), { signal: abort.signal })
  get('[data-start]').addEventListener('click', () => void run(async () => {
    const instance = current(), owner = selected; if (!instance || !owner) return
    try {
      const result = await instance.startup.launch({ cwd: get<HTMLInputElement>('[data-cwd]').value, terminal: get<HTMLSelectElement>('[data-terminal]').value })
      status.textContent = result.message; get('[data-launch-guide]').hidden = !result.instructions; get('[data-launch-instructions]').textContent = result.instructions ?? ''
    } catch (error) { uncertainLaunches.add(owner); clearGuide(); throw error }
  }), { signal: abort.signal })
  get('[data-launch-copy]').addEventListener('click', () => void run(async () => { await navigator.clipboard.writeText(get('[data-launch-instructions]').textContent ?? ''); status.textContent = vt('am.msg.copied') }), { signal: abort.signal })
  const switchConfigurationTool = (key: string) => {
    const picker = get<HTMLButtonElement>('[data-config-tool]'), previous = selected
    get('[data-config-tool-list]').hidden = true; picker.setAttribute('aria-expanded', 'false')
    const feedback = get('[data-config-switch-status]')
    if (operationPending || activeConfiguration()?.isBusy()) { feedback.textContent = vt('am.msg.busy'); feedback.hidden = false; return }
    const item = instances.get(key)
    if (!item || key === selected) return
    const category = item.instance.categories.find(summary => summary.category === configurationCategory && !summary.unavailableReason)?.category ?? item.instance.categories.find(summary => !summary.unavailableReason)?.category
    if (!category) return
    picker.disabled = true
    void run(async () => {
      try {
        selected = key; selectionExplicit = true
        await openConfiguration(category, configurationOpener ?? picker, true)
        clearGuide(); draw()
      } catch (error) {
        selected = previous
        feedback.textContent = vt('am.msg.switchFailed', { detail: error instanceof Error ? error.message : String(error) }); feedback.hidden = false
      } finally { picker.disabled = false }
    })
  }
  get('[data-config-tool]').addEventListener('click', () => {
    const list = get('[data-config-tool-list]'); list.hidden = !list.hidden
    get('[data-config-tool]').setAttribute('aria-expanded', String(!list.hidden))
  }, { signal: abort.signal })
  container.ownerDocument.addEventListener('click', event => {
    if (!(event.target instanceof Node) || get('[data-config-tool-wrap]').contains(event.target)) return
    get('[data-config-tool-list]').hidden = true; get('[data-config-tool]').setAttribute('aria-expanded', 'false')
  }, { signal: abort.signal })
  get('[data-config-close]').addEventListener('click', closeConfiguration, { signal: abort.signal })
  get<HTMLDialogElement>('[data-config-dialog]').addEventListener('cancel', event => { event.preventDefault(); closeConfiguration() }, { signal: abort.signal })
  get('[data-config-keep]').addEventListener('click', () => { get('[data-config-close-confirm]').hidden = true }, { signal: abort.signal })
  get('[data-config-leave]').addEventListener('click', () => { if (!activeConfiguration()?.isBusy()) { get<HTMLDialogElement>('[data-config-dialog]').close(); configurationOpener?.focus() } }, { signal: abort.signal })
  get('[data-instance-settings]').addEventListener('click', () => void run(async () => {
    const instance = current(), key = selected; if (!instance || !key) return
    await instance.activateSelected?.()
    get<HTMLDetailsElement>('[data-instance-details]').open = false
    let mounted = maintenance.get(key)
    const created = !mounted
    if (created) { const panel = document.createElement('section'); get('[data-maintenance-body]').append(panel); mounted = { panel, dispose: instance.mountMaintenance(panel, childContext(`maintenance:${key}`)) }; maintenance.set(key, mounted) }
    // Panels are cached across dialog sessions; a failed action leaves a panel uncertain
    // with only its hidden refresh button as recovery. Re-run the panel's own guarded
    // refresh every time the dialog reopens so the real current state restores the buttons.
    // A freshly mounted panel has just started its own refresh, so it is skipped.
    if (!created && mounted) mounted.panel.dispatchEvent(new CustomEvent('chrys-lifecycle-refresh'))
    for (const [owner, item] of maintenance) item.panel.hidden = owner !== key
    get('[data-maintenance-facts]').replaceChildren(...instance.facts.map(fact => { const item = document.createElement('p'), label = document.createElement('strong'); label.textContent = vt('am.msg.fact', { label: fact.label }); item.append(label, document.createTextNode(fact.value)); return item }))
    get<HTMLDialogElement>('[data-maintenance-dialog]').showModal()
  }), { signal: abort.signal })
  get('[data-update]').addEventListener('click', () => {
    const id = selected && instances.get(selected)?.adapterId, instance = current()
    if (!id || !instance?.updateLabel) return
    get('[data-add-panel] h2').textContent = vt('am.page.upgrade', { name: instance.name })
    get('[data-adapter-picker]').replaceChildren()
    showAdoption(id, true)
    get<HTMLDialogElement>('[data-add-panel]').showModal()
  }, { signal: abort.signal })
  get('[data-maintenance-close]').addEventListener('click', () => get<HTMLDialogElement>('[data-maintenance-dialog]').close(), { signal: abort.signal })
  const showAdoption = (id: string, install = false) => {
    const entry = adapters.get(id); if (!entry) return
    const key = install ? `${id}:install` : id
    const mount = install ? entry.adapter.mountInstallation : entry.adapter.mountAdoption
    if (!mount) throw new Error(vt('am.msg.installGuideMissing'))
    let mounted = adoption.get(key)
    if (!mounted) { const panel = document.createElement('section'); get('[data-adoption-body]').append(panel); mounted = { panel, dispose: mount.call(entry.adapter, panel, childContext(`adoption:${key}`), () => void refresh()) }; adoption.set(key, mounted) }
    for (const [owner, item] of adoption) item.panel.hidden = owner !== key
  }
  get('[data-add]').addEventListener('click', () => { get('[data-add-panel] h2').textContent = vt('am.page.addAgent'); get('[data-adapter-picker]').replaceChildren(...[...adapters].map(([id, item]) => button(item.registration.name, () => showAdoption(id)))); const first = adapters.keys().next().value; if (first) showAdoption(first); get<HTMLDialogElement>('[data-add-panel]').showModal() }, { signal: abort.signal })
  get('[data-install]').addEventListener('click', () => {
    const id = selected && instances.get(selected)?.adapterId
    if (!id || !current()?.installLabel) return
    get('[data-add-panel] h2').textContent = current()!.installLabel!
    get('[data-adapter-picker]').replaceChildren()
    showAdoption(id, true)
    get<HTMLDialogElement>('[data-add-panel]').showModal()
  }, { signal: abort.signal })
  get('[data-add-close]').addEventListener('click', () => get<HTMLDialogElement>('[data-add-panel]').close(), { signal: abort.signal })
  container.addEventListener('keydown', event => { if (event.key === 'Escape' && !get('[data-all-panel]').hidden) { event.preventDefault(); get('[data-all-panel]').hidden = true; get('[data-all]').setAttribute('aria-expanded', 'false'); get('[data-all]').focus() } }, { signal: abort.signal })
  void refresh()
  return () => { abort.abort(); for (const item of maintenance.values()) item.dispose(); for (const item of adoption.values()) item.dispose(); for (const item of configurations.values()) item.controller.dispose(); for (const item of adapters.values()) item.adapter.dispose(); context.setDirty(false); container.replaceChildren() }
}
