/** Framework navigation identity is stable; labels and ordering belong to the host. */
export const navigationGroups = [
  { id: 'personal', titleKey: 'nav.group.personal', order: 0 },
  { id: 'team', titleKey: 'nav.group.team', order: 1 },
  { id: 'shared', titleKey: 'nav.group.shared', order: 2 },
  { id: 'custom', titleKey: 'nav.group.custom', order: 3, emptyKey: 'nav.group.empty' },
] as const
export type NavigationGroupId = typeof navigationGroups[number]['id']
export const navigationNodes: ReadonlyArray<{ kind: 'group'; groupId: NavigationGroupId } | { kind: 'page'; pageId: 'extensions' }> = [
  ...navigationGroups.map(group => ({ kind: 'group' as const, groupId: group.id })),
  { kind: 'page', pageId: 'extensions' },
]

export const navigationIcons = ['home', 'work', 'agent', 'projects', 'insights', 'members', 'publications', 'subscriptions', 'appstore'] as const
export interface PageNavigation {
  groupId?: NavigationGroupId
  icon?: typeof navigationIcons[number]
  order?: number
  when?: { team?: 'required'; previewOnly?: boolean; device?: 'local' }
}

/** Shared presentation metadata never grants permissions or changes route context. */
export function validatePageNavigation(value: PageNavigation): void {
  if (value.groupId !== undefined && !navigationGroups.some(group => group.id === value.groupId)) throw new Error(`Unknown UI navigation group: ${value.groupId}`)
  if (value.order !== undefined && !Number.isFinite(value.order)) throw new Error('UI order must be finite')
  if (value.icon !== undefined && !navigationIcons.includes(value.icon)) throw new Error(`Unknown UI icon: ${value.icon}`)
  if (value.when !== undefined && (!value.when || typeof value.when !== 'object' || Array.isArray(value.when))) throw new Error('Invalid UI visibility condition')
  if (value.when && (Object.keys(value.when).some(key => !['team', 'previewOnly', 'device'].includes(key)) || value.when.team !== undefined && value.when.team !== 'required' || value.when.device !== undefined && value.when.device !== 'local' || value.when.previewOnly !== undefined && typeof value.when.previewOnly !== 'boolean')) throw new Error('Invalid UI visibility condition')
}
