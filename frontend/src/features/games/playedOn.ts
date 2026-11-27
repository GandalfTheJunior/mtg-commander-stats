export const invalidPlayedOn = 'Bitte ein gültiges Spieldatum im Format JJJJ-MM-TT eingeben oder das Feld leeren.'
export const futurePlayedOn = 'Bitte heute oder ein früheres Spieldatum wählen.'
export const missingPlayedOnZone = 'Deine Zeitzone konnte nicht ermittelt werden. Prüfe die Zeitzoneneinstellung deines Geräts und verwende einen aktuellen Browser oder lasse das Spieldatum leer.'

export function playedOnProblem(code?: string): string {
  if (code === 'PLAYED_ON_FUTURE') return futurePlayedOn
  if (code === 'PLAYED_ON_TIME_ZONE_INVALID') return missingPlayedOnZone
  if (code === 'PLAYED_ON_INVALID') return invalidPlayedOn
  return ''
}

/** No guessed fallback: fixed offsets cannot express local daylight-saving rules. */
export function browserTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!zone || /^[+-]/.test(zone)) return undefined
    new Intl.DateTimeFormat('en', { timeZone: zone }).format()
    return zone
  } catch { return undefined }
}
