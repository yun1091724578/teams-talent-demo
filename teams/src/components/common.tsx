import { currentMemberOwnsTask } from '../task-assignment.js';
import { Button, Tag, Space, Tooltip } from 'antd';
import { ArrowRightOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { actionKeys, type Action, type Role } from '../domain.js';
const originKeys = { historical: 'origin.historical', static: 'origin.static', native: 'origin.native' } as const;
export function Origin({ kind }: { kind: 'historical' | 'simulated' | 'static' | 'native' }) {
  const t = useT();
  if (kind === 'simulated') return null;
  return <Tag className="origin-tag" color={{ historical: 'blue', simulated: 'default', static: 'purple', native: 'green' }[kind]}>{t(originKeys[kind])}</Tag>;
}
/** Labels are completion statements ("Requirement assigned"); buttons always pass their own text. */
export function ActionButton({ action, children, disabled, role: required, primary = true }: { action: Action; children: ReactNode; disabled?: boolean; role?: Role; primary?: boolean }) {
  const { perform, role, busy, state } = useDemo();
  const t = useT();
  const wrongRole = required && required !== role;
  return <Tooltip title={wrongRole ? t(required === 'owner' ? 'action.requiresOwner' : 'action.requiresMember') : undefined}><Button data-action={action} aria-label={typeof children === 'string' ? children : t(actionKeys[action])} type={primary ? 'primary' : 'default'} disabled={disabled || !!wrongRole || required === 'member' && !currentMemberOwnsTask(state) || busy} loading={busy} onClick={() => void perform(action)}>{children}</Button></Tooltip>;
}
export function LinkButton({ href, children, external = false }: { href: string; children: ReactNode; external?: boolean }) { return <Button href={href} target={external ? '_blank' : undefined} icon={<ArrowRightOutlined />} iconPlacement="end">{children}</Button>; }
export function Heading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="object-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <Space wrap>{actions}</Space>}</div>;
}
export function StatusLine({ complete, children }: { complete: boolean; children: ReactNode }) { return <div className={'status-line ' + (complete ? 'complete' : '')}>{complete ? <CheckCircleOutlined /> : <ClockCircleOutlined />}<span>{children}</span></div>; }
export function MiniStat({ label, value, note }: { label: string; value: ReactNode; note?: string }) { return <div className="mini-stat"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>; }
export function Mono({ children }: { children: ReactNode }) { return <code className="mono-inline">{children}</code>; }
export { talentLink, teamsLink } from '../system-links.js';
