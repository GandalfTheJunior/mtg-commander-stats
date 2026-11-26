import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import type { GamePreview } from './api'
import CompactGameCard from './CompactGameCard'
import { savedCommander } from './test/commanderFixtures'
import { uid } from './test/gameFixtures'

const participants = [
  { userId: uid(1), username: 'Ada', deck: { id: uid(101), name: 'Praetors’ Council', commanders: [savedCommander('Atraxa')], colorIdentity: [], companion: null } },
  { userId: uid(2), username: 'Emil', deck: { id: uid(102), name: 'Dragon Engine', commanders: [savedCommander('Karn')], colorIdentity: [], companion: null } },
]
const game = (overrides: Partial<GamePreview>): GamePreview =>
  ({ id: uid(500), groupId: uid(10), result: 'WIN', winnerUserId: uid(1), playedOn: '2026-11-14', participants, ...overrides })

// Same word comparison as axe's label-content-name-mismatch rule (WCAG 2.5.3 Label in Name):
// punctuation is ignored and the visible words must appear, in order, within the accessible name.
const words = (text: string) => text.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ')
function expectVisibleTextInName(link: HTMLElement) {
  const visible = words(link.textContent ?? '').join(' ')
  const name = words(link.getAttribute('aria-label') ?? '').join(' ')
  expect(` ${name} `).toContain(` ${visible} `)
}

test.each([
  ['win', game({}), 'Spieldetails: Ada · Deck: Praetors’ Council · Gespielt am: 14.11.2026'],
  ['draw', game({ result: 'DRAW', winnerUserId: null }), 'Spieldetails: Unentschieden · Gespielt am: 14.11.2026'],
  ['unknown date', game({ playedOn: null }), 'Spieldetails: Ada · Deck: Praetors’ Council · Spieldatum unbekannt'],
])('%s card names its link with its visible text (#354)', (_, value, name) => {
  render(<MemoryRouter><CompactGameCard game={value} /></MemoryRouter>)
  const link = screen.getByRole('link', { name })
  expectVisibleTextInName(link)
})
