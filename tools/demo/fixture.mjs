import {readFileSync} from 'node:fs';

// Real, reviewed printing/Oracle metadata shared with the test-only backend provider.
export const cards = JSON.parse(readFileSync(new URL('../../backend/src/test/resources/scryfall/demo-cards.json', import.meta.url))).cards;
const colors = values => ['W', 'U', 'B', 'R', 'G'].filter(color => values.includes(color));
function commander(card, chosenColor, gameplayFaceIndex, artworkFaceIndex) {
  const metadata = cards[card];
  const rules = gameplayFaceIndex === undefined ? metadata : cards['Zndrsplt, Eye of Wisdom'];
  return {card, name: rules.name, oracleId: rules.oracle_id,
    selectionRef: {scryfallCardId: metadata.id, ...(gameplayFaceIndex === undefined ? {} : {gameplayFaceIndex})},
    ...(chosenColor === undefined ? {} : {chosenColor}),
    ...(artworkFaceIndex === undefined ? {} : {artworkFaceIndex}),
    baseColorIdentity: colors(rules.color_identity),
    effectiveColorIdentity: colors([...rules.color_identity, chosenColor])};
}
const c = commander;
// Preserve the original twelve logical decks, seating and outcomes. Each owner's
// third deck is unused; game outcomes are never rewritten to create unused data.
export const users = [
  ['ada', 'Ada', [['Dragon Engine', [c('The Ur-Dragon')]], ['Patient Constructs', [c('Karn, Silver Golem')]], ['A very long expedition name for Pir and Toothy beyond the edge of the map', [c('Pir, Imaginative Rascal'), c('Toothy, Imaginary Friend')]]]],
  ['bruno', 'Bruno', [['Goblin Workshop', [c('Krenko, Mob Boss')]], ['Forest Council', [c('The Prismatic Piper', 'G'), c('Gilanra, Caller of Wirewood')]], ['The Prismatic Bridge on the other side of Esika', [c('Esika, God of the Tree', undefined, undefined, 1)]]]],
  ['cleo', 'Cleo', [['Graveyard Shift', [c('Meren of Clan Nel Toth')]], ['Sea Stories', [c('Talrand, Sky Summoner')]], ['Avacyn and the back-side Purifier illustration', [c('Archangel Avacyn', undefined, undefined, 1)]]]],
  ['dara', 'Dara', [['Sunlit Tokens', [c('Faceless One', 'W'), c('Acolyte of Bahamut')]], ['Old Artifacts', [c('Breya, Etherium Shaper')]], ['Dragon Engine — a different illustration', [c('The Ur-Dragon (alternate art)')]]]],
  ['emil', 'Emil', [['Wild Lands', [c('Omnath, Locus of Rage')]], ['Spirit Parade', [c('Clara Oswald', 'W'), c('The Second Doctor')]], ['Zndrsplt: reversible printing, same Oracle identity', [c('Zndrsplt (reversible)', undefined, 0, 1)]]]],
  ['faye', 'Faye', [['Night Court', [c('Queen Marchesa')]], ['Spore Garden', [c('The Mycotyrant')]], ['Friends forever across all five colors', [c('Cecily, Haunted Mage'), c('Othelm, Sigardian Outcast')]]]],
].map(([key, name, decks]) => ({key, name, email: `${key}@commander.example`, decks: decks.map(([name, commanders], index) => ({key: `${key}-${index}`, name, commanders, colorIdentity: colors(commanders.flatMap(c => c.effectiveColorIdentity))}))}));

export function deckRequest(deck) {
  return {name: deck.name, commanders: deck.commanders.map(({selectionRef, chosenColor}) => ({selectionRef, ...(chosenColor === undefined ? {} : {chosenColor})}))};
}

export const groups = [
  {key: 'friday', name: 'Demo Friday Table', owner: 'ada', members: ['ada', 'bruno', 'cleo', 'dara', 'emil']},
  {key: 'sunday', name: 'Demo Sunday Table', owner: 'faye', members: ['cleo', 'dara', 'emil', 'faye']},
];

// Twenty Friday games (rotating one seat), sixteen Sunday games. The first
// twelve Friday games include Ada: her Dragons win six; Constructs never win.
export const games = groups.flatMap(group => Array.from({length: group.key === 'friday' ? 20 : 16}, (_, i) => {
  const members = group.key === 'friday'
    ? (i < 12 ? ['ada', 'bruno', 'cleo', i % 3 === 0 ? 'emil' : 'dara'] : ['bruno', 'cleo', 'dara', 'emil'])
    : group.members;
  const participants = members.map(user => ({user, deck: `${user}-${i % 2}`}));
  const draw = group.key === 'friday' ? i === 13 || i === 19 : i % 7 === 6;
  const winner = draw ? null : group.key === 'friday' && i < 12 && i % 2 === 0 ? 'ada'
    : members.filter(user => user !== 'ada')[i % (members.length - (members.includes('ada') ? 1 : 0))];
  return {key: `${group.key}-${i + 1}`, group: group.key, participants, result: draw ? 'DRAW' : 'WIN', winner};
}));
export const archivedDeck = 'dara-1';

export function results(source = games) {
  return groups.map(group => {
    const recorded = source.filter(game => game.group === group.key);
    const rows = group.members.flatMap(user => [
      {kind: 'player', user, name: users.find(u => u.key === user).name},
      ...users.find(u => u.key === user).decks.map(deck => ({kind: 'deck', user, deck: deck.key, name: deck.name})),
    ]).map(row => {
      const appearances = recorded.filter(game => game.participants.some(p => p.user === row.user && (!row.deck || p.deck === row.deck)));
      const wins = appearances.filter(game => game.winner === row.user).length;
      return {...row, games: appearances.length, wins, winRatePercent: appearances.length ? Number((100 * wins / appearances.length).toFixed(2)) : 0};
    });
    return {group: group.key, name: group.name, games: recorded.length, draws: recorded.filter(g => g.result === 'DRAW').length, rows};
  });
}
