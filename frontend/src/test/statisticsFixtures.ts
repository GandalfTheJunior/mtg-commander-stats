import { savedCommander } from './commanderFixtures'
import type { GroupStatistics } from '../api'
import { uid } from './gameFixtures'

export function statistics(): GroupStatistics {
  return {
    ...emptyStatistics(),
    players: [
      { userId: uid(1), username: 'Ada', games: 12, wins: 6, winRatePercent: 50 },
      { userId: uid(2), username: 'Emil', games: 12, wins: 1, winRatePercent: 8.33 },
      { userId: uid(9), username: 'Former member', games: 4, wins: 0, winRatePercent: 0 },
    ],
    decks: [
      { deckId: uid(101), ownerUserId: uid(1), ownerUsername: 'Ada', name: 'Dragon Engine', commanders: [savedCommander('The Ur-Dragon')], archived: false, games: 6, wins: 6, winRatePercent: 100 },
      { deckId: uid(102), ownerUserId: uid(1), ownerUsername: 'Ada', name: 'Patient Constructs', commanders: [savedCommander('Karn, Silver Golem')], archived: false, games: 6, wins: 0, winRatePercent: 0 },
      { deckId: uid(109), ownerUserId: uid(9), ownerUsername: 'Former member', name: 'Old Artifacts', commanders: [savedCommander('Breya')], archived: true, games: 4, wins: 0, winRatePercent: 0 },
    ],
  }
}

export function emptyStatistics(playerCount?: number): GroupStatistics {
  return { players: [], decks: [],
    startPositions: (playerCount ? [playerCount] : [2, 3, 4, 5, 6]).map(n => ({ playerCount: n as 2 | 3 | 4 | 5 | 6,
      seats: Array.from({ length: n }, (_, i) => ({ startPosition: i + 1, games: 0, wins: 0, winRatePercent: null })) })),
    manaColors: (['W', 'U', 'B', 'R', 'G', 'C'] as const).map(color => ({ color, games: 0, wins: 0, winRatePercent: null })),
  }
}
