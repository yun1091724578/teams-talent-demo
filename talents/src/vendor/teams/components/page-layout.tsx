import { vt } from '../i18n.js'
import type { ReactNode } from 'react'
/** 页面名称由面包屑展示；此处只承载对象标题、说明、操作和页签。 */
export function PageHeader({ title, description, actions, tabs }: { title?: string; description?: string; actions?: ReactNode; tabs?: ReactNode }) {
  if (!title && !description && !actions && !tabs) return null
  return <header className="page-header">{(title || description || actions) && <div className="page-heading">{(title || description) && <div>{title && <h1>{title}</h1>}{description && <p>{description}</p>}</div>}{actions}</div>}{tabs}</header>
}
export function PageToolbar({ children }: { children: ReactNode }) { return <div className="page-toolbar" role="region" aria-label={vt('layout.pageToolbar')}>{children}</div> }
export function OverviewLayout({ main, auxiliary }: { main: ReactNode; auxiliary: ReactNode }) { return <div className="overview-layout"><div className="page-stack">{main}</div><div className="page-stack">{auxiliary}</div></div> }
export function FrameworkCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) { return <section className="framework-card"><div className="card-heading"><h2>{title}</h2>{action}</div>{children}</section> }
export function PageState({ kind = 'empty', title, children }: { kind?: 'loading' | 'empty' | 'error' | 'confirmation'; title: string; children?: ReactNode }) { return <section className={`page-state ${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live="polite"><h3>{title}</h3>{children}</section> }
export function DetailLayout({ children, side }: { children: ReactNode; side?: ReactNode }) { return <div className={side ? 'detail-layout' : 'page-stack'}><div>{children}</div>{side && <aside>{side}</aside>}</div> }
export function SettingsLayout({ navigation, children }: { navigation?: ReactNode; children: ReactNode }) { return navigation ? <div className="settings-layout"><nav aria-label={vt('layout.profileNavigation')}>{navigation}</nav><div className="settings-content">{children}</div></div> : <>{children}</> }
