export type GroupTab = 'games' | 'statistics' | 'members'
export const groupUrl = (id: string, tab: GroupTab = 'games') => `/playgroups/${encodeURIComponent(id)}${tab === 'games' ? '' : `?tab=${tab}`}`
export const groupUnavailable = 'Diese Playgroup ist nicht verfügbar. Bitte wähle eine Gruppe aus der aktuellen Liste.'
