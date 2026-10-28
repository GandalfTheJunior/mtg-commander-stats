import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoApiError} from './diagnostics.mjs';
import {users, groups, games, archivedDeck, results, deckRequest, cards, readOutcome} from './fixture.mjs';

// One cookie jar per real session. Never log responses, cookies, tokens or bodies.
export class Session {
  constructor(base, request = fetch) { this.base = base; this.fetch = request; this.cookies = new Map(); }
  async call(method, path, body, expected = 200) {
    const headers = {'Content-Type': 'application/json', Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')};
    if (this.csrf && method !== 'GET') headers[this.csrf.headerName] = this.csrf.token;
    const response = await this.fetch(`${this.base}/api${path}`, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000)});
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const at = pair.indexOf('=');
      const name = pair.slice(0, at), value = pair.slice(at + 1);
      if (value) this.cookies.set(name, value); else this.cookies.delete(name);
    }
    if (response.status !== expected) throw new DemoApiError(method, path, response.status, expected);
    return expected === 204 || expected >= 400 ? undefined : response.json();
  }
  async login(email, password) {
    this.csrf = await this.call('GET', '/csrf');
    const user = await this.call('POST', '/session', {email, password});
    this.csrf = undefined;
    this.csrf = await this.call('GET', '/csrf');
    assert.deepEqual(await this.call('GET', '/me'), user);
    return user;
  }
}

export async function seed(base, password, onStage = () => {}) {
  onStage('accounts-and-decks');
  const accounts = {}, decks = {}, tables = {}, recordedGames = {};
  for (const user of users) {
    const session = new Session(base);
    const registered = await session.call('POST', '/users', {email: user.email, username: user.name, password}, 201);
    const signedIn = await session.login(user.email, password);
    assert.equal(signedIn.id, registered.id);
    accounts[user.key] = {id: registered.id, session};
    for (const deck of user.decks) {
      const saved = await session.call('POST', '/decks', deckRequest(deck), 201);
      decks[deck.key] = saved.id;
      for (const [index, commander] of deck.commanders.entries()) {
        if (commander.artworkFaceIndex !== undefined) await session.call('PUT', `/decks/${saved.id}/commanders/${index + 1}/artwork`, {scryfallCardId: commander.selectionRef.scryfallCardId, artworkFaceIndex: commander.artworkFaceIndex});
      }
    }
  }
  onStage('playgroups');
  for (const group of groups) {
    const owner = accounts[group.owner].session;
    const created = await owner.call('POST', '/groups', {name: group.name}, 201);
    tables[group.key] = created.id;
    const {code} = await owner.call('GET', `/groups/${created.id}/join-code`);
    for (const member of group.members.filter(key => key !== group.owner)) {
      await accounts[member].session.call('POST', '/groups/join', {code});
    }
  }
  onStage('games');
  for (const game of games) {
    const group = groups.find(g => g.key === game.group);
    const payload = {
      participants: game.participants.map(({user, deck, ...outcome}) => ({userId: accounts[user].id, deckId: decks[deck], ...outcome})),
      result: game.result, alternateWinCon: game.alternateWinCon,
    };
    const path = `/groups/${tables[game.group]}/games`;
    const saved = await accounts[group.owner].session.call('POST', path, payload, 201);
    recordedGames[saved.id] = game;
    assertGame(saved, game, accounts);
    assert.deepEqual(await accounts[group.owner].session.call('GET', `${path}/${saved.id}`), saved);
  }
  await accounts.dara.session.call('POST', `/decks/${decks[archivedDeck]}/archive`);
  onStage('fixture-verification');
  await verify(base, password, {accounts, decks, tables, recordedGames});
}

function verifyCommanders(actual, fixture) {
  assert.equal(actual.length, fixture.commanders.length);
  for (const [index, commander] of fixture.commanders.entries()) {
    const saved = actual[index], card = cards[commander.card];
    const side = commander.artworkFaceIndex === undefined ? (card.image_uris ? card : card.card_faces[0]) : card.card_faces[commander.artworkFaceIndex];
    assert.equal(saved.position, index + 1);
    assert.equal(saved.oracleId, commander.oracleId);
    assert.equal(saved.name, commander.name);
    assert.deepEqual(saved.selectionRef, commander.selectionRef);
    assert.equal(saved.chosenColor, commander.chosenColor ?? null);
    assert.equal(saved.requiresChosenColor, commander.chosenColor !== undefined);
    assert.deepEqual(saved.colorIdentity, commander.baseColorIdentity);
    assert.deepEqual(saved.effectiveColorIdentity, commander.effectiveColorIdentity);
    assert.equal(saved.scryfallCardId, card.id);
    assert.equal(saved.artCropUrl, side.image_uris.art_crop);
    assert.equal(saved.artist, side.artist);
    assert.equal(saved.illustrationId, side.illustration_id);
    assert.equal(saved.scryfallUri, card.scryfall_uri);
    assert.equal(saved.artworkFaceIndex, commander.artworkFaceIndex ?? (card.image_uris ? null : 0));
  }
}

async function verify(base, password, {accounts, decks, tables, recordedGames}) {
  const observed = [];
  for (const user of users) {
    // Fresh sign-in proves the documented credentials work independently of registration.
    const session = new Session(base);
    assert.equal((await session.login(user.email, password)).id, accounts[user.key].id);
    const ownDecks = await session.call('GET', '/decks');
    assert.deepEqual(ownDecks.map(d => d.id).sort(), user.decks.map(d => decks[d.key]).sort());
    for (const deck of ownDecks) {
      const fixture = user.decks.find(d => decks[d.key] === deck.id);
      assert.equal(deck.archived, deck.id === decks[archivedDeck]);
      assert.equal(deck.everUsed, games.some(g => g.participants.some(p => p.deck === fixture.key)));
      assert.deepEqual(deck.colorIdentity, fixture.colorIdentity);
      verifyCommanders(deck.commanders, fixture);
      // Offline snapshot/name-only writes and permanent chosen-color locks.
      const renamed = await session.call('PUT', `/decks/${deck.id}`, {name: fixture.name});
      assert.deepEqual(renamed, deck);
      for (const [index, commander] of fixture.commanders.entries()) {
        if (deck.everUsed && commander.chosenColor) {
          const changed = deckRequest(fixture);
          changed.commanders[index].chosenColor = commander.chosenColor === 'R' ? 'U' : 'R';
          await session.call('PUT', `/decks/${deck.id}`, changed, 409);
        }
      }
    }
    const memberships = await session.call('GET', '/groups');
    assert.deepEqual(memberships.map(g => g.id).sort(), groups.filter(g => g.members.includes(user.key)).map(g => tables[g.key]).sort());
    for (const group of groups.filter(g => !g.members.includes(user.key))) {
      await session.call('GET', `/groups/${tables[group.key]}/games`, undefined, 403);
      await session.call('GET', `/groups/${tables[group.key]}/statistics`, undefined, 403);
    }
  }
  for (const group of groups) {
    const session = accounts[group.owner].session, id = tables[group.key];
    const details = await session.call('GET', `/groups/${id}`);
    assert.deepEqual(details.members.map(m => [m.userId, m.role]).sort(), group.members.map(key => [accounts[key].id, key === group.owner ? 'OWNER' : 'MEMBER']).sort());
    for (const member of group.members) {
      const eligible = await session.call('GET', `/groups/${id}/members/${accounts[member].id}/decks`);
      assert.deepEqual(eligible.map(d => d.id).sort(), users.find(u => u.key === member).decks.filter(d => d.key !== archivedDeck).map(d => decks[d.key]).sort());
    }
    const manifest = JSON.parse(readFileSync(new URL('./expected-results.json', import.meta.url)));
    for (const count of ['All', '2', '3', '4', '5', '6']) {
      const statistics = await session.call('GET', `/groups/${id}/statistics${count === 'All' ? '' : `?playerCount=${count}`}`);
      assert.deepEqual(Object.keys(statistics).sort(), ['decks', 'manaColors', 'players', 'startPositions']);
      const expectedGroup = (count === 'All' ? manifest.groups : manifest.filters[count]).find(g => g.group === group.key);
      const expected = expectedGroup.rows.filter(row => row.games > 0);
      assert.deepEqual(statistics.startPositions, expectedGroup.startPositions);
      assert.deepEqual(statistics.manaColors, expectedGroup.manaColors);
      const expectedPlayers = expected.filter(row => row.kind === 'player').map(row => ({
        userId: accounts[row.user].id, username: row.name, games: row.games, wins: row.wins, winRatePercent: row.winRatePercent,
      }));
      const expectedDecks = expected.filter(row => row.kind === 'deck').map(row => ({
        deckId: decks[row.deck], ownerUserId: accounts[row.user].id, ownerUsername: users.find(u => u.key === row.user).name,
        name: row.name,
        archived: row.deck === archivedDeck, games: row.games, wins: row.wins, winRatePercent: row.winRatePercent,
      }));
      // Compare by stable IDs here; backend API tests separately enforce name/UUID ordering.
      const byId = field => (a, b) => a[field].localeCompare(b[field]);
      assert.deepEqual(statistics.players.toSorted(byId('userId')), expectedPlayers.toSorted(byId('userId')));
      for (const deck of statistics.decks) {
        const fixture = users.flatMap(u => u.decks).find(d => decks[d.key] === deck.deckId);
        verifyCommanders(deck.commanders, fixture);
      }
      assert.deepEqual(statistics.decks.map(({commanders, ...row}) => row).toSorted(byId('deckId')), expectedDecks.toSorted(byId('deckId')));
    }
    const history = await session.call('GET', `/groups/${id}/games`);
    for (const game of history) {
      assertGame(game, recordedGames[game.id], accounts);
      assert.equal(game.groupId, id);
      assert.ok(game.recordedAt);
      const participants = game.participants.map(p => {
        const user = users.find(u => accounts[u.key].id === p.userId);
        const deck = user.decks.find(d => decks[d.key] === p.deckId);
        assert.equal(p.deck.archived, deck.key === archivedDeck);
        verifyCommanders(p.deck.commanders, deck);
        assert.deepEqual(p.deck.colorIdentity, deck.colorIdentity);
        return {user: user.key, deck: deck.key, startPosition: p.startPosition};
      });
      observed.push({group: group.key, participants, result: game.result, winner: game.winnerUserId ? users.find(u => accounts[u.key].id === game.winnerUserId).key : null});
    }
  }
  assert.deepEqual(results(observed), JSON.parse(readFileSync(new URL('./expected-results.json', import.meta.url))).groups);
  // Backend must reject a new assignment of the archived used deck.
  const game = games.find(g => g.participants.some(p => p.deck === archivedDeck));
  const group = groups.find(g => g.key === game.group);
  await accounts[group.owner].session.call('POST', `/groups/${tables[group.key]}/games`, {
    participants: game.participants.map(p => ({userId: accounts[p.user].id, deckId: decks[p.deck], startPosition: p.startPosition, stillInGame: true})), result: 'DRAW', alternateWinCon: false,
  }, 400);
  assert.equal((await accounts[group.owner].session.call('GET', `/groups/${tables[group.key]}/games`)).length, games.filter(g => g.group === group.key).length);
  for (const {session} of Object.values(accounts)) await session.call('DELETE', '/session', undefined, 204);
}

function assertGame(actual, expected, accounts) {
  assert.ok(expected, 'Unexpected historical game');
  assert.equal(actual.result, expected.result);
  assert.equal(actual.alternateWinCon, expected.alternateWinCon);
  assert.equal(actual.winnerUserId, expected.winner ? accounts[expected.winner].id : null);
  assert.equal(actual.participants.length, expected.participants.length);
  for (const p of expected.participants) {
    const row = actual.participants.find(r => r.userId === accounts[p.user].id);
    assert.equal(row.startPosition, p.startPosition);
    const outcome = readOutcome(expected, p);
    assert.equal(row.placement, outcome.placement);
    assert.equal(row.stillInGame, outcome.stillInGame);
  }
}
