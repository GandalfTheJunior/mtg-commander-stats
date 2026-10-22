import type { MagicColor, SavedCommander } from '../api'
export const printingId = '00000000-0000-4000-8000-000000000301'
export function savedCommander(name = 'Karn', colors: MagicColor[] = []): SavedCommander {
  return { position: 1, oracleId: '00000000-0000-4000-8000-000000000401', name,
    selectionRef: { scryfallCardId: printingId }, scryfallCardId: printingId, canBeSoleCommander: true,
    requiresChosenColor: false, colorIdentity: colors, effectiveColorIdentity: colors, chosenColor: null,
    artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null }
}
