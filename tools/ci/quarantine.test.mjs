import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quarantineProblems} from './quarantine.mjs';

const valid = {
  runner: 'vitest', file: 'src/DeckManager.test.tsx', test: 'shows decks',
  issue: 'https://github.com/GandalfTheJunior/mtg-commander-stats/issues/314', since: '2026-11-16', until: '2026-11-30',
};
const exists = () => true;
const plainSpec = () => "test('accepts once', async ({page}) => {})";
const problems = change => quarantineProblems([{...valid, ...change}], exists, plainSpec);

test('the committed registry is valid', () => {
  const registry = JSON.parse(readFileSync(new URL('../../frontend/test-quarantine.json', import.meta.url), 'utf8'));
  assert.deepEqual(quarantineProblems(registry), []);
});

test('accepts a complete entry of at most 14 days for either runner', () => {
  assert.deepEqual(problems({}), []);
  assert.deepEqual(problems({runner: 'playwright', file: 'e2e/claims.pw.ts'}), []);
});

test('requires every field and rejects unknown ones', () => {
  assert.match(problems({issue: ''})[0], /needs non-empty text for: issue/);
  assert.match(quarantineProblems([{runner: 'vitest'}], exists)[0], /file, test, issue, since, until/);
  assert.match(problems({reason: 'slow'})[0], /unknown fields: reason/);
  assert.deepEqual(quarantineProblems({}, exists), ['The registry must be a JSON array.']);
});

test('requires a test file of the named runner that exists', () => {
  assert.match(problems({runner: 'jest'})[0], /runner must be vitest or playwright/);
  assert.match(problems({file: 'e2e/claims.pw.ts'})[0], /must be a vitest test file/);
  assert.match(problems({file: 'src/DeckManager.tsx'})[0], /must be a vitest test file/);
  assert.match(quarantineProblems([valid], () => false)[0], /src\/DeckManager\.test\.tsx does not exist/);
});

test('rejects Playwright specs that declare tags with the tag option', () => {
  const tagged = () => "test('accepts once', {tag: '@slow'}, async ({page}) => {})";
  const playwright = {...valid, runner: 'playwright', file: 'e2e/claims.pw.ts'};
  assert.deepEqual(quarantineProblems([playwright], exists, plainSpec), []);
  assert.match(quarantineProblems([playwright], exists, tagged)[0], /uses the Playwright tag option/);
  // Inline tags are part of the title and are matched exactly.
  assert.deepEqual(quarantineProblems([{...playwright, test: 'accepts once @slow'}], exists, () => "test('accepts once @slow', () => {})"), []);
});

test('requires a tracking issue in this repository', () => {
  assert.match(problems({issue: 'https://github.com/someone/else/issues/1'})[0], /issue must be the URL/);
  assert.match(problems({issue: '#314'})[0], /issue must be the URL/);
});

test('requires real dates in order and no more than 14 days apart', () => {
  assert.match(problems({until: '30.11.2026'})[0], /YYYY-MM-DD/);
  assert.match(problems({since: '2026-13-01'})[0], /YYYY-MM-DD/);
  assert.match(problems({until: '2026-11-15'})[0], /must not be before since/);
  assert.match(problems({until: '2026-12-01'})[0], /longer than 14 days/);
});
