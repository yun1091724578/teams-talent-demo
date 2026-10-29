// Boot: load state from the Talents service, then render the iCode Teams shell around the Talents pages.
// Teams links here as /talents?role=owner|member#/<page>?project=<id>; the role picks the entry.
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, App as AntApp, Button, ConfigProvider, Select, Spin, Tooltip } from 'antd';
import zhCN from 'antd/locale/zh_CN.js';
import enUS from 'antd/locale/en_US.js';
import { LocaleProvider, useLocale, useT } from './i18n.tsx';
import { MenuFoldOutlined, MenuUnfoldOutlined, ReadOutlined } from '@ant-design/icons';
import { FrameworkSidebar } from './vendor/teams/components/framework-sidebar.tsx';
import { teamsTheme, type UiThemeMode } from './vendor/teams/theme.ts';
import { designSystemCss } from './vendor/teams/design-system.ts';
import { frameworkCss } from './vendor/teams/framework-styles.ts';
import { bootstrap, type Boot } from './api.ts';
import { levelHash, pages } from './navigation.ts';
import { TalentsProvider, useTalents } from './store.tsx';
import { artifact, member, project } from './demo/model.ts';
import type { Role } from './types.ts';
import { Projects, Team } from './pages/level.tsx';
import { Capabilities } from './pages/capabilities.tsx';
import { Overview } from './pages/overview.tsx';
import { Account } from './pages/account.tsx';
import './shell.css';
import './talents.css';
const css = document.createElement('style'); css.textContent = designSystemCss + frameworkCss; document.head.prepend(css);

const content: Record<string, () => ReactNode> = {
  team: Team, projects: Projects, capabilities: Capabilities, overview: Overview, account: Account,
};

function Shell({ mode, onToggleTheme }: { mode: UiThemeMode; onToggleTheme(): void }) {
  const { state: st, teams, route, role, go, teamsLink } = useTalents();
  const { locale, setLocale } = useLocale();
  const t = useT();
  const [width, setWidth] = useState(200); // the Teams sidebar default
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('talents-sidebar-collapsed') === 'true');
  useEffect(() => { localStorage.setItem('talents-sidebar-collapsed', String(collapsed)); }, [collapsed]);
  const person = (r: Role) => member(st, r === 'admin' ? st.team.admin : st.team.me)?.name ?? t('shell.memberMissing');
  const page = route.page, Page = content[page.id];
  // The level shown (a project, or the team) and the artifact open in its review tab.
  const focus = page.id === 'projects' ? project(st, route.params.project) : null;
  const level = focus || page.id === 'team' ? focus?.id ?? null : undefined;
  const opened = level !== undefined && (!route.params.tab || route.params.tab === 'review') ? artifact(st, route.params.id) : null;
  const crumbs: { label: string; href?: string }[] = focus ? [{ label: page.title, href: '#/projects' }, { label: focus.name }] : [{ label: page.title }];
  if (opened) { crumbs[crumbs.length - 1].href = levelHash(level!, 'review'); crumbs.push({ label: opened.name }); }
  const projects = <div role="group" aria-label={t('topbar.projectList')}>{st.projects.map(p => <a key={p.id} className={'child' + (focus?.id === p.id ? ' active' : '')} href={levelHash(p.id)} title={p.name} aria-current={focus?.id === p.id ? 'page' : undefined}>{p.name}</a>)}</div>;

  return <div className="framework-root" style={{ '--ui-shell-sidebar': width + 'px' } as CSSProperties}>
    <div className={'framework-shell' + (collapsed ? ' teams-navigation-collapsed' : '')}>
      <FrameworkSidebar pages={pages.filter(p => p.role === role)} navigation={role === 'admin' ? { projects } : {}} selected={page.id} context={{ projectId: focus?.id }}
        collapsed={collapsed} width={width} onResize={setWidth} online themeMode={mode} onToggleTheme={onToggleTheme}
        account={{ nickname: person(role) + ' · ' + (role === 'admin' ? 'Owner' : t('shell.member')), color: role === 'admin' ? 'var(--ui-color-avatar-5)' : 'var(--ui-color-avatar-2)' }} />
      <main className="framework-main">
        <header className="main-topbar compact-topbar">
          <Tooltip title={t(collapsed ? 'topbar.expandNavigation' : 'topbar.collapseNavigation')}><Button className="global-navigation-toggle" type="text" aria-label={t(collapsed ? 'topbar.expandNavigation' : 'topbar.collapseNavigation')} aria-expanded={!collapsed}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(value => !value)} /></Tooltip>
          <nav className={'breadcrumb' + (crumbs.length > 1 ? ' project-breadcrumb' : '')} aria-label={t('topbar.location')}>
            <Select className="compact-system-switch" aria-label={t('topbar.switchSystem')} size="small" variant="borderless" value="talent" popupMatchSelectWidth={180}
              onChange={value => { const lang = localStorage.getItem('demo-locale') === 'en' ? '&lang=en' : ''; location.href = value === 'tools' ? new URL('/teams?demo-role=' + (role === 'admin' ? 'owner' : 'member') + lang + '#/agent', teams.origin).toString() : teamsLink(); }}
              options={[{ value: 'teams', label: 'iCode Teams' }, { value: 'talent', label: 'iCode Talents' }, { value: 'tools', label: 'iCode / OpenCode' }]} />
            {crumbs.map(c => <Fragment key={c.label}><span className="breadcrumb-separator">/</span>
              {c.href ? <a className="breadcrumb-parent" href={c.href}>{c.label}</a> : <strong aria-current="page" title={c.label}>{c.label}</strong>}</Fragment>)}
          </nav>
          <div className="topbar-right">
            <Select className="compact-lang-switch" aria-label={t('lang.switch')} size="small" variant="borderless" value={locale} onChange={value => setLocale(value)} popupMatchSelectWidth={140} options={[{ value: 'zh', label: t('lang.zh') }, { value: 'en', label: t('lang.en') }]} />
            <span className="caption">{person('admin')} · {t('shell.admin')}</span>
            <Tooltip title={t('shell.overview')}><Button variant="text" color={page.id === 'overview' ? 'primary' : 'default'} size="small" aria-label={t('shell.overview')} icon={<ReadOutlined />} onClick={() => go('#/overview')} /></Tooltip>
          </div>
        </header>
        {!teams.online && <Alert type="warning" banner showIcon title={t('shell.teamsOffline')}
          description={t('shell.teamsOfflineNote', { state: st.projects.length ? t('shell.teamsOfflineCached') : t('shell.teamsOfflineEmpty') })} />}
        <div className={'page-scroll' + (opened ? ' workbench-scroll' : '')} key={page.id + (focus?.id ?? '')}><Page /></div>
      </main>
    </div>
  </div>;
}

function Main() {
  const { locale } = useLocale();
  const t = useT();
  const [mode, setMode] = useState<UiThemeMode>(() => localStorage.getItem('carddemo-theme') === 'dark' ? 'dark' : 'light');
  const [boot, setBoot] = useState<Boot>(), [fatal, setFatal] = useState('');
  useEffect(() => { document.documentElement.dataset.theme = mode; localStorage.setItem('carddemo-theme', mode); }, [mode]);
  useEffect(() => {
    bootstrap().then(b => {
      if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/projects');
      setBoot(b);
    }, e => setFatal((e as Error).message));
  }, []);
  let body;
  if (fatal) body = <div className="startup"><Alert type="error" title={t('shell.connectFailed')} description={t('shell.connectFailedHint', { error: fatal })} action={<Button onClick={() => location.reload()}>{t('shell.retry')}</Button>} /></div>;
  else if (!boot) body = <div className="startup"><Spin size="large" /><p>{t('shell.connecting')}</p></div>;
  else body = <TalentsProvider boot={boot}><Shell mode={mode} onToggleTheme={() => setMode(mode === 'dark' ? 'light' : 'dark')} /></TalentsProvider>;
  return <ConfigProvider locale={locale === 'zh' ? zhCN : enUS} theme={teamsTheme(mode)}><AntApp>{body}</AntApp></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><Main /></LocaleProvider>);
