import { afterEach, expect, test, vi } from 'vitest'
import { searchCommanders } from './api'
import { savedCommander } from './test/commanderFixtures'
import { response } from './test/gameFixtures'

afterEach(() => vi.unstubAllGlobals())

test('partner lookup transmits the full gameplay reference without serializing authoritative identity or capabilities', async () => {
  const card = { ...savedCommander('Face'), thumbnailUrl: null }
  const fetchMock = vi.fn(async () => response([card])); vi.stubGlobal('fetch', fetchMock)
  const controller = new AbortController()
  await searchCommanders('English & name', controller.signal, { ...card.selectionRef, gameplayFaceIndex: 1 })
  expect(fetchMock).toHaveBeenCalledWith(`/api/scryfall/commanders?q=English%20%26%20name&partnerOf=${card.scryfallCardId}&partnerGameplayFaceIndex=1`,
    { credentials: 'same-origin', signal: controller.signal })
})

test.each([undefined, null, {}, { roles: 'PARTNER', partnerWith: [], variants: [] }, { roles: [], partnerWith: [], variants: [1] }])('malformed pairing metadata cannot become selectable (%j)', async pairing => {
  vi.stubGlobal('fetch', vi.fn(async () => response([{ ...savedCommander(), pairing, thumbnailUrl: null }])))
  await expect(searchCommanders('name')).rejects.toThrow('pairing metadata')
})
