/** Dashboard actions. Only group entry uses the opaque single-use manager token;
 * deck actions open stable URLs with a separate session-scoped return context. */
export type DashboardIntent =
  | { kind: 'group'; id: string }
  | { kind: 'deck'; id: string }
  | { kind: 'create-deck' }

export type DashboardEntry = Extract<DashboardIntent, { kind: 'group' }> | { kind: 'invalid' }
export type DashboardEntryProps = {
  takeDashboardEntry?: () => DashboardEntry | undefined
}

export const unavailableEntry = 'Das ausgewählte Ziel ist nicht mehr verfügbar. Bitte wähle einen Eintrag aus der aktuellen Liste.'
