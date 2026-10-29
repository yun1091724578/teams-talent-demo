import { useRef, useState, type ReactNode } from 'react'
import { Button, Dropdown, Tooltip } from 'antd'
import { AppstoreOutlined, HomeOutlined, RobotOutlined, FolderOutlined, UserOutlined, MoonOutlined, SunOutlined, CheckSquareOutlined, TeamOutlined, BarChartOutlined, SendOutlined, BookOutlined } from '@ant-design/icons'
import { pageRouteHash, type ClientContext, type PageDefinition, type PageGroup } from '../page-registry.js'
import type { UiThemeMode } from '../theme.js'
import { navigationGroups, navigationNodes } from '../contracts/navigation.js'
import { vt } from '../i18n.js'
const icons = { home: <HomeOutlined />, work: <CheckSquareOutlined />, agent: <RobotOutlined />, projects: <FolderOutlined />, insights: <BarChartOutlined />, members: <TeamOutlined />, publications: <SendOutlined />, subscriptions: <BookOutlined /> }
export function FrameworkSidebar({ pages, navigation, selected, context, collapsed, width, onResize, online, themeMode, onToggleTheme, account }: { pages: PageDefinition[]; navigation: Record<string, ReactNode>; selected?: string; context: ClientContext; collapsed: boolean; width: number; onResize: (width: number) => void; online: boolean; themeMode: UiThemeMode; onToggleTheme: () => void; account?: { nickname: string; color: string; avatarDataUrl?: string } }) {
  const [closed, setClosed] = useState<PageGroup[]>([])
  const [closedNavigation, setClosedNavigation] = useState<string[]>([])
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const resize = (value: number) => onResize(Math.min(480, Math.max(200, value)))
  const personalSelected = pages.some(page => page.id === selected && (['account', 'preferences', 'settings'].includes(page.id) || page.contribution?.slot === 'settings'))
  const connectionLabel = vt(online ? 'sidebar.connectionOnline' : 'sidebar.connectionOffline')
  const themeLabel = vt(themeMode === 'dark' ? 'sidebar.themeToLight' : 'sidebar.themeToDark')
  const themeIcon = themeMode === 'dark' ? <MoonOutlined /> : <SunOutlined />
  const avatar = <span className="avatar" style={account ? { background: account.color } : undefined}>{account ? (account.avatarDataUrl ? <img src={account.avatarDataUrl} alt="" aria-hidden /> : account.nickname.slice(0, 1).toUpperCase()) : <UserOutlined />}</span>
  const connection = <span className={`sidebar-connection ${online ? 'online' : 'offline'}`} role="status" aria-label={connectionLabel} tabIndex={0}><span className="sidebar-connection-dot" /></span>
  const link = (page: PageDefinition, parent = false) => {
    const current = selected === page.id && (!parent || !context.projectId && !context.objectId)
    return <Tooltip key={page.id} title={collapsed ? page.title : ''} placement="right"><a href={pageRouteHash(page, parent ? { teamId: context.teamId } : context)} aria-label={page.title} className={current ? 'active' : ''} aria-current={current ? 'page' : undefined}><span className="nav-icon">{icons[(page.icon ?? page.id) as keyof typeof icons] ?? <AppstoreOutlined />}</span><span className="nav-label">{page.title}</span></a></Tooltip>
  }
  return <aside className="sidebar framework-sidebar"><nav aria-label={vt('sidebar.navigation')}>{navigationNodes.map(node => {
    if (node.kind === 'page') {
      const page = pages.find(page => page.id === node.pageId)
      return page ? <div key={page.id} className="nav-entry standalone-nav-entry">{link(page)}</div> : null
    }
    const group = navigationGroups.find(group => group.id === node.groupId)!
    const groupTitle = vt(group.titleKey)
    const entries = pages.filter(page => page.groupId === group.id)
    return <div key={group.id}>
      <button className="nav-group" aria-label={vt('sidebar.collapseGroup', { name: groupTitle })} aria-expanded={!closed.includes(group.id)} onClick={() => setClosed(value => value.includes(group.id) ? value.filter(item => item !== group.id) : [...value, group.id])}>{collapsed ? '·' : groupTitle}</button>
      {!closed.includes(group.id) && entries.map(page => {
        const children = navigation[page.id]
        const hasNavigation = !!children
        const open = !closedNavigation.includes(page.id)
        return <div key={page.id} className="nav-entry">{link(page, hasNavigation)}{hasNavigation && !collapsed && <>
          <button className="project-expand" aria-label={vt('sidebar.togglePage', { name: page.title })} aria-expanded={open} onClick={() => setClosedNavigation(value => open ? [...value, page.id] : value.filter(id => id !== page.id))}>{open ? '⌃' : '⌄'}</button>
          {open && children}
        </>}</div>
      })}
      {!closed.includes(group.id) && !collapsed && !entries.length && 'emptyKey' in group && <p className="ui-note">{vt(group.emptyKey)}</p>}
    </div>
  })}</nav><div className="sidebar-foot">
    <div className="sidebar-profile-row">
      <Tooltip title={vt('sidebar.profile')} placement="top"><a href="#account" aria-label={vt('sidebar.profile')} className={`sidebar-user${personalSelected ? ' active' : ''}`} aria-current={personalSelected ? 'page' : undefined}>{avatar}<span className="nav-label">{account?.nickname ?? vt('sidebar.profileShort')}</span></a></Tooltip>
      <Tooltip title={connectionLabel}>{connection}</Tooltip>
      <Tooltip title={themeLabel}><Button type="text" aria-label={themeLabel} icon={themeIcon} onClick={onToggleTheme} /></Tooltip>
    </div>
    <Dropdown trigger={['click']} placement="topRight" menu={{ items: [
      { key: 'account', label: <a href="#account">{vt('sidebar.profileShort')}</a>, icon: <UserOutlined /> },
      { key: 'settings', label: <a href="#settings">{vt('sidebar.clientSettings')}</a> },
      { type: 'divider' },
      { key: 'connection', label: connectionLabel, icon: <span><span className={`sidebar-connection-dot ${online ? 'online' : 'offline'}`} /></span>, disabled: true },
      { key: 'theme', label: themeLabel, icon: themeIcon, onClick: onToggleTheme },
    ] }}>
      <Button type="text" className={`sidebar-profile-menu sidebar-user${personalSelected ? ' active' : ''}`} aria-label={vt('sidebar.profileMenu')}>{avatar}</Button>
    </Dropdown>
  </div>{!collapsed && <div className="sidebar-resize-handle" role="separator" aria-label={vt('sidebar.resize')} aria-orientation="vertical" aria-valuemin={200} aria-valuemax={480} aria-valuenow={width} tabIndex={0}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return
      event.preventDefault()
      event.currentTarget.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { pointerId: event.pointerId, x: event.clientX, width }
    }}
    onPointerMove={event => {
      if (drag.current?.pointerId === event.pointerId) resize(drag.current.width + event.clientX - drag.current.x)
    }}
    onPointerUp={() => { drag.current = null }}
    onPointerCancel={() => { drag.current = null }}
    onLostPointerCapture={() => { drag.current = null }}
    onKeyDown={event => {
      const value = { ArrowLeft: width - 10, ArrowRight: width + 10, Home: 200, End: 480 }[event.key]
      if (value !== undefined) { event.preventDefault(); resize(value) }
    }}
    onDoubleClick={() => onResize(220)}
    title={vt('sidebar.resizeHint')}
  />}</aside>
}
