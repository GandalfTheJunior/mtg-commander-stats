import type { MagicColor } from '../api'

export type HallDeck = { id: string; name: string; owner: string; colors: MagicColor[]; games: number; wins: number; ink: string; sky: string; motif: 'sun' | 'tower' | 'forest' | 'moon' | 'mountain' | 'sea' }
// Authored fictional snapshots, not a ranking/allocation algorithm.
export const hallDecks: HallDeck[] = [
  { id: 'dawn', name: 'Die Hüterin der Morgenröte', owner: 'Mira', colors: ['W'], games: 12, wins: 9, ink: '#e0bc72', sky: '#564a52', motif: 'sun' },
  { id: 'tide', name: 'Der Turm zwischen den Gezeiten', owner: 'Fenn', colors: ['U', 'B'], games: 10, wins: 6, ink: '#7fc3c5', sky: '#162840', motif: 'tower' },
  { id: 'grove', name: 'Das Gedächtnis des Waldes', owner: 'Liora', colors: ['G'], games: 8, wins: 4, ink: '#b4cf83', sky: '#233f34', motif: 'forest' },
  { id: 'moon', name: 'Ein Pakt mit dem Mond', owner: 'Orin', colors: ['B'], games: 10, wins: 1, ink: '#baaad5', sky: '#302a45', motif: 'moon' },
  { id: 'ember', name: 'Glut unter dem Berg', owner: 'Tavi', colors: ['R', 'G'], games: 8, wins: 1, ink: '#edac72', sky: '#582f30', motif: 'mountain' },
  { id: 'sea', name: 'Die letzte Flaschenpost', owner: 'Nela', colors: [], games: 6, wins: 1, ink: '#add5d5', sky: '#28445b', motif: 'sea' },
]
export const hallFixtures = {
  full: { legends: hallDecks.slice(0, 3), unlucky: hallDecks.slice(3) },
  sparse: { legends: [hallDecks[0], null, hallDecks[2]], unlucky: [null, hallDecks[4], null] },
}
