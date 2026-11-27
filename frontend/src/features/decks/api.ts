import { ApiError, checkedResponse, errorMessage, isRecord, isUuid, requestDefaults, unsafeRequest } from '../../shared/http/client'

export const magicColors = ['W', 'U', 'B', 'R', 'G'] as const
export type MagicColor = (typeof magicColors)[number]

export type Deck = {
  id: string
  name: string
  commanders: SavedCommander[]
  colorIdentity: MagicColor[]
  everUsed: boolean
  archived: boolean
  manaBoxUrl: string | null
  companion?: SavedCompanion | null
  /** Persisted format; legacy responses without it are regular Commander decks. */
  format?: DeckFormat
}
export const deckFormats = ['COMMANDER', 'PAUPER_COMMANDER'] as const
export type DeckFormat = (typeof deckFormats)[number]
export type CompanionChoice = { selectionRef: CommanderSelectionRef; name: string; colorIdentity: MagicColor[]; thumbnailUrl: string | null }
/** Printing-local artwork selector accepted by atomic deck writes (#241). */
export type ArtworkSelection = { scryfallCardId: string; artworkFaceIndex?: number }

export type CommanderSelectionRef = { scryfallCardId: string; gameplayFaceIndex?: number }
export type PairingCapabilities = { roles: string[]; partnerWith: string[]; variants: string[] }
export type CommanderChoice = {
  pairing: PairingCapabilities;
  selectionRef: CommanderSelectionRef; scryfallCardId: string; name: string; colorIdentity: MagicColor[]
  requiresChosenColor: boolean; canBeSoleCommander: boolean; thumbnailUrl: string | null
}
export type CardFace = { faceIndex: number | null; name: string; typeLine: string | null; oracleText: string | null; imageUrl: string | null }
export type SavedCompanion = Pick<SavedCommander, 'oracleId' | 'name' | 'selectionRef' | 'scryfallCardId' | 'colorIdentity' | 'artworkFaceIndex' | 'artCropUrl' | 'illustrationId' | 'artist' | 'scryfallUri' | 'cardFaces'>
/**
 * Saved Scryfall-linked token printing of a Commander (#234). Only the primary `imageUrl` is displayed (#235);
 * `cardFaces` is kept as delivered and never drives a token flip.
 */
export type RelatedToken = { scryfallCardId: string; name: string; typeLine: string | null; imageUrl: string | null; layout: string; cardFaces: CardFace[] | null }
export type SavedCommander = Omit<CommanderChoice, 'thumbnailUrl'> & {
  cardFaces?: CardFace[] | null
  /** Commander-only: null = legacy/unknown/pending, [] = resolved without links; absent in older responses. */
  relatedTokens?: RelatedToken[] | null
  position: number; oracleId: string; chosenColor: MagicColor | null; effectiveColorIdentity: MagicColor[]
  artworkFaceIndex: number | null; artCropUrl: string | null; illustrationId: string | null; artist: string | null; scryfallUri: string | null
}
export type DeckInput = {
  name: string; manaBoxUrl?: string | null; format?: DeckFormat
  commanders?: { selectionRef: CommanderSelectionRef; chosenColor?: MagicColor; artwork?: ArtworkSelection }[]
  companion?: { selectionRef: CommanderSelectionRef; artwork?: ArtworkSelection } | null
}
export const commanderNames = (deck: { commanders: { name: string }[] }) => deck.commanders.map(card => card.name).join(' / ')
export const scryfallUnavailable = 'Scryfall is currently imprisoned in the moon… Please try again later.'

export function deckFrom(value: unknown): Deck {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('everUsed' in value) || typeof value.everUsed !== 'boolean' ||
    !('archived' in value) || typeof value.archived !== 'boolean' ||
    !('colorIdentity' in value) ||
    !Array.isArray(value.colorIdentity) ||
    !value.colorIdentity.every((color) =>
      magicColors.includes(color as MagicColor),
    ) || value.colorIdentity.join('') !== canonicalColors(value.colorIdentity)
  ) {
    throw new Error('The server returned an invalid deck response.')
  }
  return {
    id: value.id,
    name: value.name,
    commanders: commandersFrom('commanders' in value ? value.commanders : undefined),
    colorIdentity: value.colorIdentity as MagicColor[],
    everUsed: value.everUsed,
    archived: value.archived,
    ...('companion' in value ? { companion: companionFrom(value.companion) } : {}),
    manaBoxUrl: 'manaBoxUrl' in value && typeof value.manaBoxUrl === 'string' ? value.manaBoxUrl : null,
    ...('format' in value && value.format !== undefined ? { format: formatFrom(value.format) } : {}),
  }
}

function formatFrom(value: unknown): DeckFormat {
  if (!deckFormats.includes(value as DeckFormat)) throw new Error('The server returned an invalid deck format.')
  return value as DeckFormat
}

export async function deckResponse(response: Response, fallback: string, status: number): Promise<Deck> {
  return deckFrom(await (await checkedResponse(response, status, fallback)).json())
}

export async function listDecks(signal?: AbortSignal): Promise<Deck[]> {
  const response = await fetch('/api/decks', { ...requestDefaults, ...(signal ? { signal } : {}) })
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, 'Could not load your decks.'), response.status)
  }
  const body: unknown = await response.json()
  if (!Array.isArray(body)) {
    throw new Error('The server returned an invalid deck list.')
  }
  return body.map(deckFrom)
}

/** A keyed repeat returns 200 with the already created deck instead of creating another one. */
export async function createDeck(input: DeckInput, signal?: AbortSignal, idempotencyKey?: string): Promise<Deck> {
  const response = await unsafeRequest('POST', '/api/decks', input, signal, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
  return deckResponse(response, 'Could not create the deck.', idempotencyKey && response.status === 200 ? 200 : 201)
}

export async function updateDeck(id: string, input: DeckInput, signal?: AbortSignal): Promise<Deck> {
  const deck = await deckResponse(
    await unsafeRequest('PUT', `/api/decks/${encodeURIComponent(id)}`, input, signal),
    'Could not update the deck.', 200,
  )
  if (deck.id !== id) throw new Error('The server returned a different deck. Refresh your decks.')
  return deck
}

export async function deleteDeck(id: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', `/api/decks/${encodeURIComponent(id)}`, undefined, signal),
    204, 'Could not delete the deck.')
}

export async function archiveDeck(id: string, signal?: AbortSignal): Promise<Deck> {
  const response = await checkedResponse(
    await unsafeRequest('POST', `/api/decks/${encodeURIComponent(id)}/archive`, undefined, signal), 200, 'Could not archive the deck.',
  )
  const deck = deckFrom(await response.json())
  if (deck.id !== id || !deck.archived) throw new Error('The server did not confirm deck archival. Refresh your decks.')
  return deck
}

export function canonicalColors(colors: unknown[]): string {
  return magicColors.filter((color) => colors.includes(color)).join('')
}

function colorsFrom(value: unknown): MagicColor[] {
  if (!Array.isArray(value) || value.some(color => !magicColors.includes(color as MagicColor)) || value.join('') !== canonicalColors(value)) {
    throw new Error('The server returned invalid Commander colors.')
  }
  return value as MagicColor[]
}
function referenceFrom(value: unknown): CommanderSelectionRef {
  if (!isRecord(value) || !isUuid(value.scryfallCardId) || (value.gameplayFaceIndex !== undefined &&
    (typeof value.gameplayFaceIndex !== 'number' || !Number.isSafeInteger(value.gameplayFaceIndex) || value.gameplayFaceIndex < 0))) {
    throw new Error('The server returned an invalid Commander selection.')
  }
  return { scryfallCardId: value.scryfallCardId, ...(value.gameplayFaceIndex !== undefined ? { gameplayFaceIndex: value.gameplayFaceIndex as number } : {}) }
}
function pairingFrom(value: unknown): PairingCapabilities {
  if (!isRecord(value) || !['roles', 'partnerWith', 'variants'].every(key => Array.isArray(value[key]) && value[key].every(item => typeof item === 'string'))) {
    throw new Error('The server returned invalid Commander pairing metadata.')
  }
  return { roles: value.roles as string[], partnerWith: value.partnerWith as string[], variants: value.variants as string[] }
}
function choiceFrom(value: unknown): CommanderChoice {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name || !isUuid(value.scryfallCardId) ||
    typeof value.requiresChosenColor !== 'boolean' || typeof value.canBeSoleCommander !== 'boolean') {
    throw new Error('The server returned an invalid Commander choice.')
  }
  const selectionRef = referenceFrom(value.selectionRef)
  if (selectionRef.scryfallCardId !== value.scryfallCardId) throw new Error('The server returned inconsistent Commander printing data.')
  return { pairing: pairingFrom(value.pairing), name: value.name, selectionRef, scryfallCardId: value.scryfallCardId, colorIdentity: colorsFrom(value.colorIdentity),
    requiresChosenColor: value.requiresChosenColor, canBeSoleCommander: value.canBeSoleCommander,
    thumbnailUrl: typeof value.thumbnailUrl === 'string' && /^https:\/\//.test(value.thumbnailUrl) ? value.thumbnailUrl : null }
}
function cardFacesFrom(value: unknown): CardFace[] | null {
  if (value === null) return null
  if (!Array.isArray(value) || value.length === 0) throw new Error('The server returned invalid card faces.')
  const faces = value.map((face: unknown): CardFace => {
    if (!isRecord(face) || typeof face.name !== 'string' || !face.name ||
      (face.faceIndex !== null && (typeof face.faceIndex !== 'number' || !Number.isSafeInteger(face.faceIndex) || face.faceIndex < 0)) ||
      [face.typeLine, face.oracleText, face.imageUrl].some(text => text !== null && typeof text !== 'string')) {
      throw new Error('The server returned an invalid card face.')
    }
    return { faceIndex: face.faceIndex as number | null, name: face.name, typeLine: face.typeLine as string | null,
      oracleText: face.oracleText as string | null, imageUrl: face.imageUrl as string | null }
  })
  if (new Set(faces.map(face => face.faceIndex)).size !== faces.length || (faces.length > 1 && faces.some(face => face.faceIndex === null))) {
    throw new Error('The server returned ambiguous card faces.')
  }
  return faces
}

/** Strict nullable token snapshot; repeated printing IDs keep their first-seen entry so the count stays distinct. */
function relatedTokensFrom(value: unknown): RelatedToken[] | null {
  if (value === null) return null
  if (!Array.isArray(value)) throw new Error('The server returned invalid related tokens.')
  const seen = new Set<string>()
  return value.flatMap((token: unknown): RelatedToken[] => {
    if (!isRecord(token) || !isUuid(token.scryfallCardId) || typeof token.name !== 'string' || !token.name ||
      typeof token.layout !== 'string' || [token.typeLine, token.imageUrl].some(text => text !== null && typeof text !== 'string')) {
      throw new Error('The server returned an invalid related token.')
    }
    const cardFaces = cardFacesFrom(token.cardFaces ?? null)
    if (seen.has(token.scryfallCardId)) return []
    seen.add(token.scryfallCardId)
    return [{ scryfallCardId: token.scryfallCardId, name: token.name, typeLine: token.typeLine as string | null,
      imageUrl: token.imageUrl as string | null, layout: token.layout, cardFaces }]
  })
}

export function companionFrom(value: unknown): SavedCompanion | null {
  if (value === null) return null
  if (!isRecord(value) || !isUuid(value.oracleId) || !isUuid(value.scryfallCardId) || typeof value.name !== 'string' || !value.name ||
    (value.artworkFaceIndex !== null && (typeof value.artworkFaceIndex !== 'number' || !Number.isSafeInteger(value.artworkFaceIndex) || value.artworkFaceIndex < 0)) ||
    [value.artCropUrl, value.illustrationId, value.artist, value.scryfallUri].some(text => text !== null && typeof text !== 'string')) {
    throw new Error('The server returned an invalid saved Companion.')
  }
  const selectionRef = referenceFrom(value.selectionRef)
  if (selectionRef.scryfallCardId !== value.scryfallCardId) throw new Error('The server returned inconsistent Companion printing data.')
  return { oracleId: value.oracleId, name: value.name, selectionRef, scryfallCardId: value.scryfallCardId,
    colorIdentity: colorsFrom(value.colorIdentity), artworkFaceIndex: value.artworkFaceIndex as number | null,
    artCropUrl: value.artCropUrl as string | null, illustrationId: value.illustrationId as string | null,
    artist: value.artist as string | null, scryfallUri: value.scryfallUri as string | null,
    ...('cardFaces' in value ? { cardFaces: cardFacesFrom(value.cardFaces) } : {}) }
}

export function commandersFrom(value: unknown): SavedCommander[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) throw new Error('The server returned invalid Commanders.')
  const result = value.map((card: unknown, index): SavedCommander => {
    const choice = choiceFrom(card)
    if (!isRecord(card) || card.position !== index + 1 || !isUuid(card.oracleId) ||
      (choice.requiresChosenColor ? !magicColors.includes(card.chosenColor as MagicColor) : card.chosenColor !== null) ||
      (card.artworkFaceIndex !== null && (typeof card.artworkFaceIndex !== 'number' || !Number.isSafeInteger(card.artworkFaceIndex) || card.artworkFaceIndex < 0))) {
      throw new Error('The server returned an invalid saved Commander.')
    }
    const nullableText = (key: string): string | null => {
      if (card[key] !== null && typeof card[key] !== 'string') throw new Error('The server returned invalid Commander artwork.')
      return card[key] as string | null
    }
    const { thumbnailUrl: _thumbnail, ...metadata } = choice
    void _thumbnail
    return { ...metadata, ...('cardFaces' in card ? { cardFaces: cardFacesFrom(card.cardFaces) } : {}),
      ...('relatedTokens' in card ? { relatedTokens: relatedTokensFrom(card.relatedTokens) } : {}), position: index + 1, oracleId: card.oracleId, chosenColor: card.chosenColor as MagicColor | null,
      effectiveColorIdentity: colorsFrom(card.effectiveColorIdentity), artworkFaceIndex: card.artworkFaceIndex as number | null,
      artCropUrl: nullableText('artCropUrl'), illustrationId: nullableText('illustrationId'), artist: nullableText('artist'), scryfallUri: nullableText('scryfallUri') }
  })
  if (new Set(result.map(card => card.oracleId)).size !== result.length) throw new Error('The server returned duplicate Commanders.')
  return result
}
export async function searchCommanders(query: string, signal?: AbortSignal, partnerOf?: CommanderSelectionRef, format?: DeckFormat): Promise<CommanderChoice[]> {
  const context = (partnerOf ? `&partnerOf=${encodeURIComponent(partnerOf.scryfallCardId)}${partnerOf.gameplayFaceIndex !== undefined ? `&partnerGameplayFaceIndex=${partnerOf.gameplayFaceIndex}` : ''}` : '') +
    (format && format !== 'COMMANDER' ? `&format=${format}` : '')
  const response = await fetch(`/api/scryfall/commanders?q=${encodeURIComponent(query)}${context}`, { ...requestDefaults, signal })
  if (!response.ok) throw new ApiError(scryfallUnavailable, response.status)
  const body: unknown = await response.json()
  if (!Array.isArray(body) || body.length > 20) throw new Error(scryfallUnavailable)
  return body.map(choiceFrom)
}

export async function searchCompanions(query: string, signal?: AbortSignal): Promise<CompanionChoice[]> {
  const response = await fetch(`/api/scryfall/companions?q=${encodeURIComponent(query)}`, { ...requestDefaults, signal })
  if (!response.ok) throw new ApiError(scryfallUnavailable, response.status)
  const body: unknown = await response.json()
  if (!Array.isArray(body) || body.length > 20) throw new Error(scryfallUnavailable)
  return body.map((value: unknown): CompanionChoice => {
    if (!isRecord(value) || typeof value.name !== 'string' || !value.name) throw new Error('The server returned an invalid Companion choice.')
    return { selectionRef: referenceFrom(value.selectionRef), name: value.name, colorIdentity: colorsFrom(value.colorIdentity),
      thumbnailUrl: typeof value.thumbnailUrl === 'string' && /^https:\/\//.test(value.thumbnailUrl) ? value.thumbnailUrl : null }
  })
}

export type Artwork = Pick<SavedCommander, 'scryfallCardId' | 'artworkFaceIndex' | 'artCropUrl' | 'illustrationId' | 'artist' | 'scryfallUri'>

export async function listArtworks(reference: CommanderSelectionRef, signal?: AbortSignal): Promise<Artwork[]> {
  const context = reference.gameplayFaceIndex === undefined ? '' : `?gameplayFaceIndex=${reference.gameplayFaceIndex}`
  const response = await checkedResponse(await fetch(`/api/scryfall/cards/${encodeURIComponent(reference.scryfallCardId)}/artworks${context}`,
    { ...requestDefaults, signal }), 200, scryfallUnavailable)
  const body: unknown = await response.json()
  if (!Array.isArray(body) || body.length > 200) throw new Error('Invalid artwork list.')
  return body.map((value: unknown): Artwork => {
    if (!isRecord(value) || !isUuid(value.scryfallCardId) ||
      (value.artworkFaceIndex !== null && (typeof value.artworkFaceIndex !== 'number' || !Number.isSafeInteger(value.artworkFaceIndex) || value.artworkFaceIndex < 0)) ||
      !['artCropUrl', 'illustrationId', 'artist', 'scryfallUri'].every(key => value[key] === null || typeof value[key] === 'string')) {
      throw new Error('Invalid artwork option.')
    }
    return { scryfallCardId: value.scryfallCardId, artworkFaceIndex: value.artworkFaceIndex as number | null,
      artCropUrl: value.artCropUrl as string | null, illustrationId: value.illustrationId as string | null,
      artist: value.artist as string | null, scryfallUri: value.scryfallUri as string | null }
  })
}

export async function updateCommanderArtwork(deckId: string, commander: SavedCommander, artwork: Artwork, signal?: AbortSignal): Promise<Deck> {
  const deck = await deckResponse(await unsafeRequest('PUT',
    `/api/decks/${encodeURIComponent(deckId)}/commanders/${commander.position}/artwork`,
    { scryfallCardId: artwork.scryfallCardId, ...(artwork.artworkFaceIndex === null ? {} : { artworkFaceIndex: artwork.artworkFaceIndex }) }, signal),
  'Artwork konnte nicht gespeichert werden.', 200)
  const slot = deck.commanders.find(card => card.position === commander.position)
  if (deck.id !== deckId || slot?.oracleId !== commander.oracleId || slot.scryfallCardId !== artwork.scryfallCardId || slot.artworkFaceIndex !== artwork.artworkFaceIndex) {
    throw new Error('The artwork save could not be confirmed.')
  }
  return deck
}

export async function updateCompanionArtwork(deckId: string, companion: SavedCompanion, artwork: Artwork, signal?: AbortSignal): Promise<Deck> {
  const deck = await deckResponse(await unsafeRequest('PUT', `/api/decks/${encodeURIComponent(deckId)}/companion/artwork`,
    { scryfallCardId: artwork.scryfallCardId, ...(artwork.artworkFaceIndex === null ? {} : { artworkFaceIndex: artwork.artworkFaceIndex }) }, signal),
  'Artwork konnte nicht gespeichert werden.', 200)
  if (deck.id !== deckId || deck.companion?.oracleId !== companion.oracleId || deck.companion.scryfallCardId !== artwork.scryfallCardId ||
    deck.companion.artworkFaceIndex !== artwork.artworkFaceIndex) throw new Error('The artwork save could not be confirmed.')
  return deck
}
