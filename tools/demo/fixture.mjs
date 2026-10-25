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
// Each owner has two played decks and one unused artwork/pairing example.
export const users = [
  ['ada', 'Ada', [['Dragon Engine', [c('The Ur-Dragon')]], ['Patient Constructs', [c('Karn, Silver Golem')]], ['A very long expedition name for Pir and Toothy beyond the edge of the map', [c('Pir, Imaginative Rascal'), c('Toothy, Imaginary Friend')]]]],
  ['bruno', 'Bruno', [['Goblin Workshop', [c('Krenko, Mob Boss')]], ['Forest Council', [c('The Prismatic Piper', 'G'), c('Gilanra, Caller of Wirewood')]], ['The Prismatic Bridge on the other side of Esika', [c('Esika, God of the Tree', undefined, undefined, 1)]]]],
  ['cleo', 'Cleo', [['Graveyard Shift', [c('Meren of Clan Nel Toth')]], ['Sea Stories', [c('Talrand, Sky Summoner')]], ['Avacyn and the back-side Purifier illustration', [c('Archangel Avacyn', undefined, undefined, 1)]]]],
  ['dara', 'Dara', [['Sunlit Tokens', [c('Faceless One', 'W'), c('Acolyte of Bahamut')]], ['Old Artifacts', [c('Breya, Etherium Shaper')]], ['Dragon Engine — a different illustration', [c('The Ur-Dragon (alternate art)')]]]],
  ['emil', 'Emil', [['Wild Lands', [c('Omnath, Locus of Rage')]], ['Spirit Parade', [c('Clara Oswald', 'W'), c('The Second Doctor')]], ['Zndrsplt: reversible printing, same Oracle identity', [c('Zndrsplt (reversible)', undefined, 0, 1)]]]],
  ['gideon', 'Gideon', [['Dragon Encore', [c('The Ur-Dragon (alternate art)')]], ['Cloud Fleet', [c('Talrand, Sky Summoner')]], ['Goblin Encore', [c('Krenko, Mob Boss')]]]],
  ['faye', 'Faye', [['Night Court', [c('Queen Marchesa')]], ['Spore Garden', [c('The Mycotyrant')]], ['Friends forever across all five colors', [c('Cecily, Haunted Mage'), c('Othelm, Sigardian Outcast')]]]],
].map(([key, name, decks]) => ({key, name, email: `${key}@commander.example`, decks: decks.map(([name, commanders], index) => ({key: `${key}-${index}`, name, commanders, colorIdentity: colors(commanders.flatMap(c => c.effectiveColorIdentity))}))}));

export function deckRequest(deck) {
  return {name: deck.name, commanders: deck.commanders.map(({selectionRef, chosenColor}) => ({selectionRef, ...(chosenColor === undefined ? {} : {chosenColor})}))};
}

export const groups = [
  {key: 'friday', name: 'Demo Friday Table', owner: 'ada', members: ['ada', 'bruno', 'cleo', 'dara', 'emil', 'gideon']},
  {key: 'sunday', name: 'Demo Sunday Table', owner: 'faye', members: ['cleo', 'dara', 'emil', 'faye']},
];

// Four complementary finished games per possible table size: normal victory,
// manual competition tie (where possible), alternate victory and mixed-survivor draw.
// Array order is deliberately different from start order.
export const games = groups.flatMap(group => Array.from({length: group.members.length - 1}, (_, size) => {
  const n = size + 2, members = group.members.slice(0, n);
  return ['normal', 'tie', 'alternate', 'draw'].map((mode, variant) => {
    const winner = mode === 'draw' ? null : members[mode === 'normal' ? 0 : 1];
    const participants = members.map((user, index) => {
      const position = (index + (mode === 'normal' ? n - 1 : 1 + variant % (n - 1))) % n + 1;
      const order = [winner, ...members.filter(m => m !== winner)];
      const rank = order.indexOf(user) + 1;
      const placement = mode === 'tie' && n >= 4 && rank === 3 ? 2 : rank;
      const outcome = mode === 'draw' ? {stillInGame: index <= variant % (n - 1)}
        : mode === 'alternate' ? user === winner ? {winner: true}
          : {stillInGame: rank <= Math.min(n, 3), ...(rank > 3 ? {placement: rank} : {})}
        : {placement};
      return {user, deck: `${user}-${mode === 'normal' ? 0 : 1}`, startPosition: position, ...outcome};
    });
    return {key: `${group.key}-${n}-${mode}`, group: group.key, participants,
      result: mode === 'draw' ? 'DRAW' : 'WIN', alternateWinCon: mode === 'alternate', winner};
  });
}).flat());

// Expected GET facts; writes retain only the mode-specific fields above.
export function readOutcome(game, participant) {
  return {placement: game.result === 'DRAW' ? null : game.alternateWinCon
    ? participant.winner ? 1 : participant.stillInGame ? 2 : participant.placement : participant.placement,
  stillInGame: game.result === 'DRAW' ? participant.stillInGame : game.alternateWinCon
    ? participant.winner === true || participant.stillInGame : participant.placement === 1};
}
export const archivedDeck = 'dara-1';

export function results(source = games, playerCount) {
  return groups.map(group => {
    const recorded = source.filter(game => game.group === group.key && (playerCount === undefined || game.participants.length === playerCount));
    const rows = group.members.flatMap(user => [
      {kind: 'player', user, name: users.find(u => u.key === user).name},
      ...users.find(u => u.key === user).decks.map(deck => ({kind: 'deck', user, deck: deck.key, name: deck.name})),
    ]).map(row => {
      const appearances = recorded.filter(game => game.participants.some(p => p.user === row.user && (!row.deck || p.deck === row.deck)));
      const wins = appearances.filter(game => game.winner === row.user).length;
      return {...row, games: appearances.length, wins, winRatePercent: appearances.length ? percentage(wins, appearances.length) : null};
    });
    const metric = appearances => {
      const wins = appearances.filter(({game, p}) => game.winner === p.user).length;
      return {games: appearances.length, wins, winRatePercent: percentage(wins, appearances.length)};
    };
    const appearances = recorded.flatMap(game => game.participants.map(p => ({game, p})));
    const startPositions = (playerCount ? [playerCount] : [2, 3, 4, 5, 6]).map(n => ({playerCount: n,
      seats: Array.from({length: n}, (_, i) => ({startPosition: i + 1,
        ...metric(appearances.filter(({game, p}) => game.participants.length === n && p.startPosition === i + 1))}))}));
    const order = ['W', 'U', 'B', 'R', 'G', 'C'];
    const manaColors = order.map(color => ({color, ...metric(appearances.filter(({p}) => {
      const identity = users.find(u => u.key === p.user).decks.find(d => d.key === p.deck).colorIdentity;
      return color === 'C' ? identity.length === 0 : identity.includes(color);
    }))})).sort((a, b) => {
      if (!a.games || !b.games) return Boolean(b.games) - Boolean(a.games) || order.indexOf(a.color) - order.indexOf(b.color);
      return b.wins * a.games - a.wins * b.games || b.games - a.games || order.indexOf(a.color) - order.indexOf(b.color);
    });
    return {group: group.key, name: group.name, games: recorded.length, draws: recorded.filter(g => g.result === 'DRAW').length, rows, startPositions, manaColors};
  });
}

// Integer arithmetic implements decimal HALF_UP to two places without binary ties.
export function percentage(wins, games) {
  return games ? Number((BigInt(wins) * 20000n + BigInt(games)) / (2n * BigInt(games))) / 100 : null;
}
