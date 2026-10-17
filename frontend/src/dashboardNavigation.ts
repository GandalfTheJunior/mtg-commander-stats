/** In-memory payload; browser history carries only an opaque, single-use token. */
export type DashboardIntent =
  | { kind: 'group'; id: string }
  | { kind: 'deck'; id: string }
  | { kind: 'create-deck' }

export type DashboardEntry = DashboardIntent | { kind: 'invalid' }
export type DashboardEntryProps = {
  takeDashboardEntry?: () => DashboardEntry | undefined
}

export const unavailableEntry = 'Das ausgewählte Ziel ist nicht mehr verfügbar. Bitte wähle einen Eintrag aus der aktuellen Liste.'
