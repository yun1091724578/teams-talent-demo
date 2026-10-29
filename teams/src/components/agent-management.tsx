import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Descriptions, Space, Modal, Input } from 'antd';
import { getTools, native, getProjectWorkspaces, saveProjectWorkspace, type NativeStatus } from '../api.js';
import { Context, useDemo, type DemoContext } from '../context.js';
import { useLocale } from '../i18n.js';
import { serverText } from '../task-labels-en.js';
import { currentT as vt } from '../../../shared/i18n/index.js';
import { Origin } from './common.js';
import { mount } from '../vendor/teams/agent-management/index.js';
import { mountConfigurationEditor } from '../vendor/teams/agent-management/configuration-editor.js';
import { AGENT_UI_API, type AgentCategory, type AgentConfigurationController, type AgentUiInstance, type AgentUiModule } from '../vendor/teams/agent-management/agent-ui-contract.js';
import type { ConfigurationDocument, ConfigurationGroup, ConfigurationPort, ManagedCategory } from '../vendor/teams/agent-management/configuration-contract.js';
import { ui, type ObservedUiMountContext } from '../vendor/teams/agent-management/ui-contract.js';
import './agent-management.css';

type Tool = 'icode' | 'opencode';
const names = { icode: 'iCode', opencode: 'OpenCode' };
const demoVersion = 'demo-local-1';

// This adapter supplies demonstration records to the copied Teams editor.
// It deliberately has no native configuration write, install, or catalog transport.
function configurationPort(tool: Tool, demo: DemoContext): ConfigurationPort {
  const source = vt('am.ui.readOnlySource');
  const project = demo.state.workspace.project.name;
  const records = new Map<ManagedCategory, ConfigurationDocument[]>();
  const add = (category: ManagedCategory, id: string, name: string, scope: string, value: Record<string, string>, origin: string) => {
    const document: ConfigurationDocument = {
      resource: { id, name, scope, source: origin, readOnly: true },
      content: JSON.stringify(value, null, 2), revision: 'local-1', format: 'JSON',
      rawTitle: vt('am.ui.configContent'), formatDescription: vt('am.ui.configProjection'),
      native: value, readOnly: true,
    };
    records.set(category, [...(records.get(category) ?? []), document]);
  };
  if (tool === 'icode') {
    add('agent', 'code-agent', `Code Agent ${demo.state.adoptedAgent}`, vt('am.ui.projectAdopted', { name: project }), {
      name: 'Code Agent', version: demo.state.adoptedAgent,
      instructions: demo.state.adoptedAgent === 'r2'
        ? vt('am.content.instructionsR2')
        : vt('am.content.instructions'),
      model: vt('am.content.modelIcode'),
      scope: vt('am.content.scopeShared'),
      origin: vt('am.content.originTeams'),
    }, vt('am.ui.teamsAdoptionSource'));
    for (const skill of demo.data.skills.filter(item => demo.state.workspace.selectedSkills.includes(item.name))) {
      add('skill', skill.name, skill.name, vt('am.ui.projectSelected', { name: project }), {
        name: skill.name, version: skill.version,
        description: skill.description,
        content: demo.data.skillContents[skill.name] ?? skill.description,
        scope: vt('am.ui.projectSelectedScope'),
      }, vt('am.ui.localSkillSource'));
    }
  } else {
    add('agent', 'build', 'build', vt('am.ui.opencodeWorkdir'), {
      name: 'build', description: vt('am.doc.opencodeAgentDesc'),
      instructions: vt('am.content.opencodeInstructions'),
      model: vt('am.content.modelOpencode'), scope: vt('am.ui.readOnlyWorkdir'),
    }, vt('am.ui.opencodeSource'));
    add('skill', 'change-impact', vt('am.doc.changeImpactTitle'), vt('am.ui.opencodeWorkdir'), {
      name: 'change-impact', description: vt('am.doc.changeImpactDesc'),
      content: vt('am.content.changeImpact'),
      scope: vt('am.content.opencodeScope'),
    }, vt('am.ui.opencodeSource'));
  }
  add('model', 'native-model', vt('am.doc.modelTitle'), vt('am.ui.systemUser'), {
    provider: vt('am.ui.nativeManaged'), model: vt('am.ui.notRead'), variant: tool === 'opencode' ? vt('am.content.modelOpencode') : vt('am.content.modelIcodeNative'),
    credentials: vt('am.ui.credentialsKept'),
  }, source);
  add('mcp', 'native-mcp', vt('am.doc.mcpTitle'), vt('am.ui.nativeAgentScope'), {
    server: vt('am.ui.noMcpList'), transport: vt('am.ui.nativePermissions'),
    scope: vt('am.ui.connectionScope'),
  }, source);

  const labels: Record<string, string> = { name: vt('am.field.name'), version: vt('am.field.version'), instructions: vt('am.field.instructions'), model: vt('am.field.model'), scope: vt('am.field.scope'), origin: vt('am.field.origin'), description: vt('am.field.description'), content: vt('am.field.content'), provider: vt('am.field.provider'), variant: vt('am.field.variant'), credentials: vt('am.field.credentials'), server: vt('am.field.server'), transport: vt('am.field.transport') };
  return {
    target: vt('am.ui.targetReadOnly', { tool: names[tool] }), toolType: names[tool],
    categories: ['agent', 'model', 'skill', 'mcp'],
    async list(category) { return (records.get(category) ?? []).map(document => document.resource); },
    async read(category, resource) {
      const document = records.get(category)?.find(item => item.resource.id === resource.id);
      if (!document) throw new Error(vt('am.ui.resourceGone'));
      return document;
    },
    groups(_category, document): ConfigurationGroup[] {
      const values = document.native as Record<string, string>;
      return [{ title: vt('am.ui.configDetail'), description: vt('am.ui.configDetailNote'), fields: Object.entries(values).map(([id, value]) => ({ id, label: labels[id] ?? id, value, kind: ['instructions', 'content', 'description'].includes(id) ? 'textarea' as const : 'text' as const, readOnly: true })) }];
    },
    patch() { throw new Error(vt('am.ui.readOnlyHere')); },
    validate() {},
    async save() { throw new Error(vt('am.ui.noNativeWrite')); },
  };
}

function unavailableConfiguration(container: HTMLElement, tool: Tool): AgentConfigurationController {
  const note = document.createElement('p'); note.className = ui.note; container.append(note);
  const selectCategory = (category: AgentCategory) => {
    note.textContent = vt('am.ui.capabilityMissing', { tool: names[tool], kind: category === 'hook' ? 'Hook' : 'Plugin' });
  };
  return { activate() {}, selectCategory, hasDrafts: () => false, isBusy: () => false, getTargetLabel: () => names[tool], dispose() { container.replaceChildren(); } };
}

function OpenCodeDetails({ status }: { status: NativeStatus }) {
  const { role, run, showText } = useDemo();
  return <div className="agent-maintenance-detail"><Space><strong>OpenCode</strong><Origin kind="native" /></Space>
    <Descriptions column={1} size="small" items={[
      { key: 'status', label: vt('am.ui.localStatus'), children: status.opencode.installed ? vt('am.ui.opencodeFound') : status.opencode.unsupportedReason ?? vt('am.ui.opencodeMissing') },
      { key: 'version', label: vt('am.field.version'), children: status.opencode.version ?? vt('am.ui.notObtained') },
      { key: 'entry', label: vt('am.ui.entry'), children: status.opencode.path ?? vt('am.ui.notConfigured') },
    ]} />
    {!!status.opencode.notes?.length && <Alert type="warning" title={vt('am.ui.probeNote')} description={status.opencode.notes.join(vt('common.listSeparator'))} />}
    <Button type="primary" disabled={!status.opencode.installed} onClick={() => void run(async () => {
      const receipt = await native(role, 'launch', { tool: 'opencode', restore: false, requestId: crypto.randomUUID() });
      showText(vt('am.ui.opencodeReceipt'), JSON.stringify(receipt, null, 2));
    })}>{vt('am.ui.startOpencode')}</Button>
    <Alert type="info" title={vt('am.ui.opencodeHttp')} description={vt('am.ui.opencodeHttpNote')} />
  </div>;
}

export function AgentManagement({ nativeControls }: { nativeControls: ReactNode }) {
  const demo = useDemo(), latest = useRef(demo), node = useRef<HTMLDivElement>(null);
  // The editor builds its DOM once at mount, so a language switch remounts it.
  const { locale } = useLocale();
  const controls = useRef(nativeControls);
  const [panels, setPanels] = useState<Array<{ element: HTMLElement; content: () => ReactNode }>>([]);
  latest.current = demo; controls.current = nativeControls;
  useEffect(() => {
    setPanels([]);
    const container = node.current!;
    const abort = new AbortController();
    let statusPromise: Promise<NativeStatus> | undefined;
    const status = () => statusPromise ??= getTools();
    const mountReact = (element: HTMLElement, content: () => ReactNode) => {
      setPanels(previous => [...previous, { element, content }]);
      return () => setPanels(previous => previous.filter(panel => panel.element !== element));
    };
    const registrations = (['icode', 'opencode'] as const).map(id => ({ id, name: names[id], uiBundleId: id }));
    const observation: ObservedUiMountContext['observation'] = {
      observeBrowserOperation: async (_name, _attributes, body) => body({ event() {} }),
      async tracedFetch() { throw new Error(vt('am.ui.undeclaredNetwork')); },
      async tracedJson<T>(_name: string, input: RequestInfo | URL, init?: RequestInit) {
        let value: unknown;
        if (input === '/api/bundles/contributions') {
          value = { bundles: registrations.map(item => ({ id: item.id, version: demoVersion, module: item.id })) };
        } else if (input === '/api/bundles/agent-management/call') {
          const command = JSON.parse(String(init?.body)) as Record<string, unknown>;
          if (command.action === 'adapter.list') { statusPromise = undefined; value = { result: { adapters: registrations } }; }
          else if (command.action === 'working-directory.list') value = { result: { directories: {} } };
          else if (command.action === 'working-directory.set') {
            const configuration=await getProjectWorkspaces(),selected=configuration.projects.find(item=>item.projectId===configuration.defaultProjectId);
            if(!selected)throw new Error(vt('am.ui.workspaceFirst'));
            await saveProjectWorkspace(latest.current.role,{...selected,directory:String(command.cwd)});statusPromise=undefined;
            value = { result: {} };
          } else throw new Error(vt('am.ui.unknownAction', { action: String(command.action) }));
        } else throw new Error(vt('am.ui.unknownSource', { source: String(input) }));
        return { response: new Response(null, { status: 200 }), value: value as T };
      },
    };
    const context: ObservedUiMountContext = {
      contributionId: 'agent-management-demo', device: 'local', preview: true, signal: abort.signal, observation,
      setDirty() {}, reportError(error) { void latest.current.run(async () => { throw error; }); },
    };
    const loadModule = async (id: string): Promise<AgentUiModule & { version: string }> => {
      if (id !== 'icode' && id !== 'opencode') throw new Error(vt('am.ui.unknownAdapter'));
      const tool = id;
      return { agentUiApi: AGENT_UI_API, version: demoVersion, createAgentUi() {
        return {
          async loadInstances(): Promise<AgentUiInstance[]> {
            const current = await status(), found = current[tool], port = configurationPort(tool, latest.current);
            const discovered = 'source' in found ? found.source : undefined;
            return [{
              id: tool, name: names[tool], kind: vt('am.ui.localCli'), path: found.path ?? undefined, version: found.version ?? undefined,
              state: found.installed ? vt('am.ui.localFound') : vt('am.ui.localMissing'),
              identity: vt('am.ui.identity', { version: found.version ?? vt('am.ui.versionUnknown') }),
              facts: [{ label: vt('am.ui.dataSource'), value: vt('am.ui.dataSourceValue') }, ...(discovered ? [{ label: vt('am.ui.discovery'), value: discovered === 'official' ? vt('am.ui.discoveryOfficial') : discovered === 'override' ? vt('am.ui.discoveryOverride') : discovered === 'uv' ? vt('am.ui.discoveryUv') : discovered === 'pipx' ? vt('am.ui.discoveryPipx') : discovered === 'path' ? vt('am.ui.discoveryPath') : discovered === 'missing' ? vt('am.ui.discoveryMissing') : vt('am.ui.discoveryBundled') }] : []), { label: vt('am.ui.programPath'), value: found.path ?? vt('am.ui.notConfigured') }, { label: vt('am.field.version'), value: found.version ?? vt('am.ui.notObtained') }, { label: vt('am.ui.maintenance'), value: vt('am.ui.maintenanceValue') }],
              categories: [
                { category: 'agent', label: 'Agent', description: tool === 'icode' ? vt('am.ui.catAgentDesc', { version: latest.current.state.adoptedAgent }) : vt('am.ui.catAgentOpenCode') },
                { category: 'model', label: 'Model', description: vt('am.ui.catModelDesc') },
                { category: 'skill', label: 'Skill', description: tool === 'icode' ? vt('am.ui.catSkillDesc', { count: latest.current.state.workspace.selectedSkills.length }) : vt('am.ui.catSkillOpenCode') },
                { category: 'mcp', label: 'MCP', description: vt('am.ui.catMcpDesc') },
                { category: 'hook', label: 'Hook', description: vt('am.ui.catHookDesc'), unavailableReason: vt('am.ui.catHookUnavailable') },
                { category: 'plugin', label: 'Plugin', description: vt('am.ui.catPluginDesc'), unavailableReason: tool === 'opencode' ? vt('am.ui.catPluginUnavailableOpenCode') : vt('am.ui.catPluginUnavailableIcode') },
              ],
              startup: {
                cwd: current.icode.workspace ?? '',
                terminals: current.terminals ?? [], selectedTerminal: current.selectedTerminal,
                launchLabel: vt('am.ui.launchLabel', { tool: names[tool] }),
                hint: current.terminalError ?? vt('am.ui.launchHint', { terminal: current.terminalName ?? '' }),
                disabledReason: serverText(current.workspaceError) ?? current.terminalError ?? (found.installed ? undefined : tool === 'opencode' && current.opencode.unsupportedReason ? current.opencode.unsupportedReason : vt('am.ui.toolMissing')),
                async chooseDirectory(cwd) {return new Promise(resolve=>{let value=cwd??'';Modal.confirm({title:vt('am.ui.workdirTitle'),content:<Input defaultValue={value} onChange={event=>{value=event.target.value;}} placeholder={vt('am.ui.workdirPlaceholder')}/>,onOk(){resolve({cancelled:false,cwd:value});},onCancel(){resolve({cancelled:true});}});});},
                async selectTerminal(terminal) { await native(latest.current.role, 'terminal', { terminal }); statusPromise = undefined; },
                async launch(input) {
                  if (input.cwd !== (await status()).icode.workspace) throw new Error(vt('am.ui.cwdMismatch'));
                  const receipt = await native(latest.current.role, 'launch', { tool, restore: false, requestId: crypto.randomUUID(), terminal: input.terminal });
                  return { message: receipt.note ?? vt('am.ui.launchRequested') };
                },
              },
              mountConfiguration(element, child) {
                return mountConfigurationEditor(element, child, port, target => unavailableConfiguration(target, tool));
              },
              mountMaintenance(element) {
                return mountReact(element, () => tool === 'icode' ? <div className="agent-maintenance-detail"><Space><strong>{vt('am.ui.icodeInstance')}</strong><Origin kind="native" /></Space>{controls.current}<Alert type="info" title={vt('am.ui.installMaintenance')} description={vt('am.ui.installMaintenanceNote')} /></div> : <OpenCodeDetails status={current} />);
              },
            }];
          },
          mountAdoption(element) {
            return mountReact(element, () => <div className="agent-maintenance-detail"><Space><strong>{vt('am.ui.toolAdoption', { tool: names[tool] })}</strong><Origin kind="simulated" /></Space><Alert type="info" title={vt('am.ui.localStateTitle')} description={tool === 'icode' ? vt('am.ui.icodeAdoptionNote') : vt('am.ui.opencodeAdoptionNote')} /><p className="ui-note">{vt('am.ui.adoptionNote')}</p></div>);
          },
          dispose() {},
        };
      } };
    };
    const dispose = mount(container, context, { loadModule, configurationOwnerLabel: vt('am.ui.configOwnerLabel') });
    return () => { abort.abort(); dispose(); };
  }, [locale]);
  return <div className="agent-management-demo"><div key={locale} ref={node} />{panels.map((panel, index) => createPortal(
    <Context.Provider value={{ ...demo, showText(title, content) {
      // The host drawer lives outside this native dialog's top layer.
      panel.element.closest('dialog')?.close();
      demo.showText(title, content);
    } }}>{panel.content()}</Context.Provider>, panel.element, String(index),
  ))}<p className="agent-demo-source">{vt('am.ui.demoSource')}</p></div>;
}
