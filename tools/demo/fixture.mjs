// Stable logical references; UUIDs and recordedAt belong to the server.
export const users = [
  ['ada', 'Ada', [['Dragon Engine', 'The Ur-Dragon', ['W', 'U', 'B', 'R', 'G']], ['Patient Constructs', 'Karn, Silver Golem', []]]],
  ['bruno', 'Bruno', [['Goblin Workshop', 'Krenko, Mob Boss', ['R']], ['Forest Council', 'Ezuri, Renegade Leader', ['G']]]],
  ['cleo', 'Cleo', [['Graveyard Shift', 'Meren of Clan Nel Toth', ['B', 'G']], ['Sea Stories', 'Talrand, Sky Summoner', ['U']]]],
  ['dara', 'Dara', [['Sunlit Tokens', 'Rhys the Redeemed', ['W', 'G']], ['Old Artifacts', 'Breya, Etherium Shaper', ['W', 'U', 'B', 'R']]]],
  ['emil', 'Emil', [['Wild Lands', 'Omnath, Locus of Rage', ['R', 'G']], ['Spirit Parade', 'Millicent, Restless Revenant', ['W', 'U']]]],
  ['faye', 'Faye', [['Night Court', 'Queen Marchesa', ['W', 'B', 'R']], ['Spore Garden', 'The Mycotyrant', ['B', 'G']]]],
].map(([key, name, decks]) => ({key, name, email: `${key}@commander.example`, decks: decks.map(([name, commander, colorIdentity], index) => ({key: `${key}-${index}`, name, commander, colorIdentity}))}));

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
