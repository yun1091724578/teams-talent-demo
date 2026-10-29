import { displayText } from './display-text.js';
import { LocaleProvider, useLocale, useT } from './i18n.js';
import type { MessageKey } from '../../shared/i18n/index.js';
import { campaign } from './cashback.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Button, ConfigProvider, Descriptions, Drawer, Popconfirm, Select, Space, Spin, Tag, Tooltip, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN.js';
import enUS from 'antd/locale/en_US.js';
import { ApartmentOutlined, ArrowLeftOutlined, ArrowRightOutlined, BookOutlined, CodeOutlined, ExperimentOutlined, FileTextOutlined, MenuFoldOutlined, MenuUnfoldOutlined, QuestionCircleOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { bootstrap, act, updateWorkspace, getState, reset, type Presentation } from './api.js';
import type { WorkspaceAction } from './workspace.js';
import { Context } from './context.js';
import { actionKeys, type Action, type DemoState, type Role } from './domain.js';
import { FrameworkSidebar } from './vendor/teams/components/framework-sidebar.js';
import { FrameworkCard } from './vendor/teams/components/page-layout.js';
import { teamsTheme, type UiThemeMode } from './vendor/teams/theme.js';
import { designSystemCss } from './vendor/teams/design-system.js';
import { frameworkCss } from './vendor/teams/framework-styles.js';
import { isOwnerPage, teamsPages } from './navigation.js';
import { Home } from './pages/home.js';
import { Project } from './pages/project.js';
import { TeamsProject } from './pages/teams-project.js';
import { CreatedProjectPage } from './pages/created-project.js';
import { Resources } from './pages/resources.js';
import { Tools } from './pages/tools.js';
import { Trace } from './pages/trace.js';
import { TeamWork } from './pages/team-work.js';
import { Organization } from './pages/organization.js';
import { Team } from './pages/team.js';
import { Heading, Origin } from './components/common.js';
import { currentSystemContext, systemRuntime, talentLink, teamsLink } from './system-links.js';
import './style.css';
import './shell-navigation.css';
const css = document.createElement('style'); css.textContent = designSystemCss + frameworkCss; document.head.prepend(css);
const navKeys: Record<string, MessageKey> = { home: 'nav.home', projects: 'nav.projects', team: 'nav.team', resources: 'nav.resources', subscriptions: 'nav.subscriptions', publications: 'nav.publications', agent: 'nav.agent', connections: 'nav.connections', organization: 'nav.connections', 'team-work': 'nav.teamWork', trace: 'nav.trace', knowledge: 'nav.knowledge', sessions: 'nav.sessions', evolution: 'nav.evolution', account: 'nav.account', settings: 'nav.account' };
const pageTitle = (t: (key: MessageKey) => string, path: string) => t(navKeys[path] ?? 'nav.projects');
const route = () => { const raw = location.hash.replace(/^#\/?/, '') || 'home'; const [path, query] = raw.split('?'); return { path, params: new URLSearchParams(query) }; };
const channel = new BroadcastChannel('teams-talent-carddemo');
function App() {
  const t = useT(), { locale, setLocale } = useLocale();
  const [boot, setBoot] = useState<{ state: DemoState; data: Presentation }>();
  const [fatal, setFatal] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role>(currentSystemContext().role);
  const [mode, setMode] = useState<UiThemeMode>(localStorage.getItem('carddemo-theme') === 'dark' ? 'dark' : 'light');
  const [current, setCurrent] = useState(route), [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem('teams-sidebar-width'));
    return Number.isFinite(saved) && saved >= 200 && saved <= 480 ? saved : 200;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('teams-sidebar-collapsed') === 'true');
  const [detail, setDetail] = useState<{ title: string; content: string } | null>(null);
  const resetting = useRef(false);
  useEffect(() => {
    bootstrap().then(b => setBoot(b)).catch(e => setFatal(e.message));
    const change = () => { setCurrent(route()); }; window.addEventListener('hashchange', change);
    let live = true;
    const refresh = () => { getState().then(state => { if (live) setBoot(b => b && state.revision > b.state.revision ? { ...b, state } : b); }).catch(e => { if (live) setError(e.message); }); };
    const sync = (e: MessageEvent) => { if (e.data === 'state') refresh(); };
    channel.addEventListener('message', sync); window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 2000);
    return () => { live = false; clearInterval(timer); window.removeEventListener('hashchange', change); channel.removeEventListener('message', sync); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = mode; localStorage.setItem('carddemo-theme', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('teams-sidebar-collapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);
  const resizeSidebar = (value: number) => { setWidth(value); localStorage.setItem('teams-sidebar-width', String(value)); };
  useEffect(() => { localStorage.setItem('carddemo-role', role); const url = new URL(location.href); url.searchParams.set('demo-role', role); history.replaceState(null, '', url); }, [role]);
  useEffect(() => { document.title = 'iCode Teams · ' + pageTitle(t, current.path); if (current.path === 'talent' && role === 'owner') location.href = talentLink('knowledge'); }, [current.path, t]);
  const run = useCallback(async <T,>(work: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true); setError(''); setNotice('');
    try { const result = await work(); if (success) setNotice(success); return result; }
    catch (e) { setError((e as Error).message); return undefined; }
    finally { setBusy(false); }
  }, []);
  const receiveState = useCallback((state: DemoState) => { setBoot(current => current && state.revision >= current.state.revision ? { ...current, state } : current); }, []);
  const navigate = useCallback((target: string) => { location.hash = '/' + target; }, []);
  if (fatal) return <div className="startup"><Alert type="error" title={t('boot.connectFailed')} description={displayText(fatal)} action={<Button onClick={() => location.reload()}>{t('boot.retry')}</Button>} /></div>;
  if (!boot) return <div className="startup"><Spin size="large" /><p>{t('boot.connecting')}</p></div>;
  const { state, data } = boot;
  const perform = async (action: Action, reason?: string, assigneeId?: string) => {
    const result = await run(() => act(state, role, action, reason, assigneeId), t('action.completed', { name: t(actionKeys[action]) }));
    if (result) { setBoot({ ...boot, state: result }); channel.postMessage('state'); }
    return !!result;
  };
  const update=async(kind:WorkspaceAction,payload:Record<string,unknown>)=>{
    const result=await run(()=>updateWorkspace(state,role,kind,payload),t('ws.updated'));
    if(result){setBoot({ ...boot,state:result});channel.postMessage('state');}
    return result;
  };
  const showText = (title: string, content: string) => setDetail({ title, content });
  const showEvidence = (id: string) => { const e = data.evidence.find(e => e.id === id); if (e) showText(id + ' · ' + e.title, e.body); };
  const resetDemo = async () => {
    if (role !== 'owner' || busy || resetting.current) return;
    resetting.current = true;
    try {
      const result = await run(() => reset(state, role), t('ws.resetDone'));
      if (result) { setBoot({ ...boot, state: result }); channel.postMessage('state'); navigate('home'); }
    } finally { resetting.current = false; }
  };
  const selected = current.path === 'organization' ? 'connections' : current.path === 'trace' ? (role === 'owner' ? 'team-work' : 'projects') : current.path;
  const projectId = currentSystemContext().projectId;
  const projectTab = current.params.get('tab') ?? (current.params.has('project') ? 'content' : 'list');
  const createdProject = current.path === 'projects' ? state.workspace.projects?.find(project => project.id === projectId) : undefined;
  const importedProject = current.path === 'projects' && projectId === 'teams';
  const projectSelected = current.path === 'projects' && projectTab !== 'list' || current.path === 'trace' && role === 'member';
  const projectName = current.path === 'projects' && projectSelected
    ? importedProject ? data.teamsProject.project.name : projectId === 'carddemo' ? state.workspace.project.name : createdProject?.name
    : undefined;
  const switchRole = (value: Role) => {
    const url = new URL(location.href);
    url.searchParams.set('demo-role', value);
    // Task selection is shared within the project and survives role changes.
    setDetail(null); setError(''); setNotice('');
    history.replaceState(null, '', url); setCurrent(route());
    localStorage.setItem('carddemo-role', value); setRole(value);
  };
  let content: React.ReactNode;
  if (role !== 'owner' && isOwnerPage(current.path)) content = <Alert type="info" title={t('gate.ownerOnly')} description={t('gate.ownerOnlyBody')} action={<Button href="#/projects">{t('gate.enterProjects')}</Button>} />;
  else if (current.path === 'home') content = <Home />;
  else if (current.path === 'projects') content = projectTab === 'list' ? <Project tab="list" /> : importedProject ? <TeamsProject params={current.params} /> : projectId === 'carddemo' ? <Project tab={projectTab} node={current.params.get('node') ?? undefined} /> : createdProject ? <CreatedProjectPage key={createdProject.id} project={createdProject} tab={projectTab} /> : <Alert type="error" title={t('proj.notFound')} action={<Button onClick={()=>navigate('projects?tab=list')}>{t('proj.viewList')}</Button>}/>;
  else if (current.path === 'team') content = <Team />;
  else if (['resources', 'subscriptions', 'publications'].includes(current.path)) content = <Resources page={current.path as 'resources' | 'subscriptions' | 'publications'} />;
  else if (current.path === 'agent') content = <Tools />;
  else if (['connections', 'organization'].includes(current.path)) content = <Organization key={current.path + current.params.toString()} />;
  else if (current.path === 'team-work') content = <TeamWork />;
  else if (current.path === 'trace') content = <Trace initial={current.params.get('evidence') ?? undefined} />;
  else if (['account', 'settings'].includes(current.path)) content = <div className="page-stack"><Heading title={pageTitle(t, current.path)} description={t('acct.description')} /><FrameworkCard title={t('acct.permissions')}><Descriptions bordered column={1} items={[{ key: 'owner', label: t('role.owner'), children: t('acct.ownerScope') }, { key: 'member', label: t('role.member'), children: t('acct.memberScope') }, { key: 'demo', label: t('acct.currentRole'), children: t('acct.currentRoleNote') }]} /><Button href="#/projects?tab=settings">{t('acct.membersRoles')}</Button></FrameworkCard>
    <FrameworkCard title={t('acct.maintenance')}><p>{t('acct.resetBody')}</p><p className="muted">{t('acct.resetNote')}</p>{role === 'owner' ? <Popconfirm title={t('acct.resetConfirmTitle')} description={t('acct.resetConfirmBody')} okText={t('acct.resetConfirmOk')} cancelText={t('common.cancel')} onConfirm={resetDemo} disabled={busy} okButtonProps={{ danger: true, loading: busy, disabled: busy, 'aria-label': t('acct.confirmResetAria') }} cancelButtonProps={{ disabled: busy, 'aria-label': t('acct.cancelResetAria') }}><Button danger aria-label={t('acct.resetAria')} icon={<ReloadOutlined />} loading={busy} disabled={busy}>{t('acct.resetWorkspace')}</Button></Popconfirm> : <p className="muted">{t('acct.ownerOnly')}</p>}</FrameworkCard>
  </div>;
  else content = <Alert type="warning" title={t('page.notFound')} action={<Button href="#/home">{t('page.backHome')}</Button>} />;
  return <ConfigProvider locale={locale === 'zh' ? zhCN : enUS} theme={teamsTheme(mode)}><Context.Provider value={{ state, data, role, busy, perform, update, run, showText, showEvidence, navigate, receiveState }}>
    <div onClickCapture={event=>{const link=(event.target as HTMLElement).closest('a');if(role === 'owner' && link?.getAttribute('href')==='#/talent'){event.preventDefault();window.open(talentLink('knowledge'),'_blank','noopener');}}} className="framework-root" style={{ '--ui-shell-sidebar': width + 'px' } as React.CSSProperties}>

      <div className={'framework-shell' + (sidebarCollapsed ? ' teams-navigation-collapsed' : '')}>{
        <FrameworkSidebar pages={teamsPages(role, t)} navigation={{ projects: <div role="group" aria-label={t('topbar.projectList')}>{[{id:'carddemo',name:state.workspace.project.name},{id:'teams',name:data.teamsProject.project.name},...(state.workspace.projects??[])].map(project=><a key={project.id} className={'child'+(projectSelected&&projectId===project.id?' active':'')} href={'#/projects?project='+project.id+'&tab=content'} title={project.name} aria-current={projectSelected&&projectId===project.id?'page':undefined}>{project.name}</a>)}</div> }} selected={selected} context={{ teamId: importedProject ? 'teams' : 'carddemo', projectId: projectSelected ? projectId : undefined }} collapsed={sidebarCollapsed} width={width} onResize={resizeSidebar} online={true} themeMode={mode} onToggleTheme={() => setMode(mode === 'dark' ? 'light' : 'dark')} account={{ nickname: role === 'owner' ? t('role.ownerShort') : t('role.memberShort'), color: role === 'owner' ? 'var(--ui-color-avatar-5)' : 'var(--ui-color-avatar-2)' }} />}
        <main className="framework-main"><header className="main-topbar compact-topbar">
          {<Tooltip title={t(sidebarCollapsed ? 'topbar.expandNavigation' : 'topbar.collapseNavigation')}><Button className="global-navigation-toggle" type="text" aria-label={t(sidebarCollapsed ? 'topbar.expandNavigation' : 'topbar.collapseNavigation')} aria-expanded={!sidebarCollapsed} icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setSidebarCollapsed(value => !value)} /></Tooltip>}
          <nav className={'breadcrumb' + (projectName ? ' project-breadcrumb' : '')} aria-label={t('topbar.location')}>
            <Select className="compact-system-switch" aria-label={t('topbar.switchSystem')} size="small" variant="borderless" value={current.path === 'agent' ? 'tools' : 'teams'} popupMatchSelectWidth={180} onChange={value=>{location.href=value==='talent'?talentLink('knowledge'):value==='tools'?teamsLink('agent'):teamsLink('home');}} options={[{value:'teams',label:'iCode Teams'},...(role === 'owner' ? [{value:'talent',label:t('nav.talents')}] : []),{value:'tools',label:'iCode / OpenCode'}]}/>
            <span className="breadcrumb-separator">/</span>{projectName ? <><a className="breadcrumb-parent" href="#/projects?tab=list">{t('topbar.projects')}</a><span className="breadcrumb-separator">/</span><strong aria-current="page" title={projectName}>{projectName}</strong></> : <strong aria-current="page" title={pageTitle(t, current.path)}>{pageTitle(t, current.path)}</strong>}
          </nav>
          <div className="topbar-right">

            <Select className="compact-lang-switch" aria-label={t('lang.switch')} size="small" variant="borderless" value={locale} onChange={value=>setLocale(value)} popupMatchSelectWidth={140} options={[{value:'zh',label:t('lang.zh')},{value:'en',label:t('lang.en')}]}/>
            <Select className="compact-role-switch" aria-label={t('topbar.switchRole')} size="small" value={role} onChange={switchRole} popupMatchSelectWidth={210} options={[{value:'owner',label:t('role.owner')},{value:'member',label:t('role.member')}]}/>
          </div>
        </header>
          <div className={'page-scroll' + (projectName ? ' project-page-scroll' : '')} key={current.path + role}>{error && <Alert className="global-alert" type="error" showIcon title={displayText(error)} closable onClose={() => setError('')} />}{notice && <Alert className="global-alert" type="success" showIcon title={displayText(notice)} closable onClose={() => setNotice('')} />}{state.campaignId !== campaign.id && <Alert type="warning" title="工作区规则版本已更新" description="当前保存记录属于旧规则，请由 Owner 在个人设置中重置工作区后继续。" action={<Button href="#/account">前往个人设置</Button>} />}{content}<footer className="page-foot"><span>{createdProject ? createdProject.name+' · 项目' : importedProject ? 'iCode Teams · 项目' : 'MKT-001 · Teams × iCode × Talents'}</span></footer></div>
        </main></div>
    </div>
    <Drawer width={880} open={!!detail} onClose={() => setDetail(null)} title={detail?.title}><pre className="evidence-console drawer-console">{detail?.content}</pre></Drawer>

  </Context.Provider></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><App /></LocaleProvider>);
