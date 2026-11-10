export type GroupTab = 'overview' | 'games' | 'statistics' | 'members'
export const groupUrl = (id: string, tab: GroupTab = 'overview') =>
  `/playgroups/${encodeURIComponent(id)}${tab === 'overview' ? '' : `/${tab}`}`
export const groupUnavailable = 'Du hast keinen Zugriff mehr auf diese Playgroup.'
