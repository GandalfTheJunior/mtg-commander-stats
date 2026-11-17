// Validates frontend/test-quarantine.json; rules in docs/development/testing.md.
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));

export const maxQuarantineDays = 14;

const files = {
  vitest: /^src\/.+\.(?:test|spec)\.tsx?$/,
  playwright: /^e2e\/.+\.pw\.ts$/,
};
const issue = /^https:\/\/github\.com\/GandalfTheJunior\/mtg-commander-stats\/issues\/\d+$/;
const fields = ['runner', 'file', 'test', 'issue', 'since', 'until'];
const day = text => (/^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? Date.parse(text) : undefined);

// Playwright appends tags declared with the `tag` option to the title it filters
// on, so playwrightTitlePattern in frontend/src/test/quarantine.ts cannot match
// such a test exactly. Inline `@tag` text in a title is part of the title.
const tagOption = /\btag\s*:/;

/** Returns one message per problem; an empty array means the registry is valid. */
export function quarantineProblems(
  entries,
  fileExists = file => existsSync(join(frontend, file)),
  readFile = file => readFileSync(join(frontend, file), 'utf8'),
) {
  if (!Array.isArray(entries)) return ['The registry must be a JSON array.'];
  const problems = [];
  entries.forEach((entry, index) => {
    const problem = message => problems.push(`Entry ${index + 1} (${entry?.test ?? 'untitled'}): ${message}`);
    if (!entry || typeof entry !== 'object') return problem('must be an object.');
    const unknown = Object.keys(entry).filter(key => !fields.includes(key));
    if (unknown.length) problem(`has unknown fields: ${unknown.join(', ')}.`);
    const missing = fields.filter(key => typeof entry[key] !== 'string' || !entry[key].trim());
    if (missing.length) return problem(`needs non-empty text for: ${missing.join(', ')}.`);
    if (!files[entry.runner]) return problem(`runner must be ${Object.keys(files).join(' or ')}.`);
    if (!files[entry.runner].test(entry.file)) problem(`file must be a ${entry.runner} test file relative to frontend/.`);
    else if (!fileExists(entry.file)) problem(`file ${entry.file} does not exist.`);
    else if (entry.runner === 'playwright' && tagOption.test(readFile(entry.file))) {
      problem(`file ${entry.file} uses the Playwright tag option, which quarantine cannot match exactly; use inline @tags in the title instead.`);
    }
    if (!issue.test(entry.issue)) problem('issue must be the URL of an issue in this repository.');
    const since = day(entry.since);
    const until = day(entry.until);
    if (since === undefined || until === undefined) return problem('since and until must be YYYY-MM-DD dates.');
    if (until < since) problem('until must not be before since.');
    else if ((until - since) / 86_400_000 > maxQuarantineDays) problem(`lasts longer than ${maxQuarantineDays} days.`);
  });
  return problems;
}
