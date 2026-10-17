/** Dashboard actions open stable URLs; authorization is verified by the target. */
export type DashboardIntent =
  | { kind: 'group'; id: string }
  | { kind: 'deck'; id: string }
  | { kind: 'create-deck' }
