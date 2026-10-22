# Partner discovery fixtures

`partner-discovery.json` contains reduced real Scryfall responses captured on
2026-10-22 for PR #112. The five scenarios cover ordinary Partner and every
named variant observed that day: Survivors, Friends forever, Character select,
and Father & son. Tests run offline; they do not assert that future provider
responses or result counts must stay unchanged.

Each `query` was sent to `https://api.scryfall.com/cards/search` with
`unique=cards&order=name`. All five responses were HTTP 200, without warnings
or further pages. `context` comes from the response to
`lang:en game:paper f:commander o:/^Partner/`. Card identity, name, layout,
language, type, Oracle text, keywords, Commander legality and color identity
are retained verbatim; unrelated fields and other formats' legalities are
omitted. Each `response` preserves its complete result list and order.

To repeat a captured query (requires curl and jq), from this directory:

```bash
curl --get 'https://api.scryfall.com/cards/search' \
  --user-agent 'mtg-commander-stats/PR112-verification (https://github.com/GandalfTheJunior/mtg-commander-stats)' \
  --header 'Accept: application/json' \
  --data-urlencode "q=$(jq -r '.["exact-survivors"].query' partner-discovery.json)" \
  --data-urlencode 'unique=cards' --data-urlencode 'order=name'
```

Use at least 150 ms between request starts. The fixture replay matches the
complete captured query, independently of the small pairing-filter stub used
by the synthetic tests.

## Adaptation of backup e36c4d7

The original five cases ran unchanged first: three passed and two failed.
Those failures demonstrate a mismatch for invented metadata, not a verified
provider failure:

- The named keyword-only fixture had `keywords: ["Partner—New label"]` but
  Oracle text `Flying`. All 19 observed named-variant cards instead had generic
  `Partner` keywords and the specific ability in Oracle text. The three named
  cases now exercise this observed representation with Survivors, Friends
  forever and a synthetic new label. A wrong label must remain undiscoverable.
- The ordinary text-only fixture omitted `Partner` from its keyword metadata.
  The real query `lang:en game:paper f:commander o:/^Partner( *\(|$)/ -kw:partner`
  returned HTTP 404 (no matches); all 58 ordinary Partner cards were indexed
  by `kw:partner`. The ordinary case now includes that metadata.
- The broad-keyword rejection remains and also checks named Partner and
  reciprocal Partner with candidates, which really share `kw:partner`.

Scryfall's keyword catalog contained `Partner`, `Partner with` and the legacy
`Friends forever`, but no named `Partner—…` keywords. A live query using
`kw:"Partner—Survivors"` warned that the unknown keyword expression was ignored;
it did not provide a usable variant filter. Current Friends forever cards use
`Partner—Friends forever` in Oracle text and `Partner` in keywords.

The classifier's tolerance of partial/synthetic metadata does not establish
an upstream indexing contract. Standard future labels are covered at the lookup
boundary with their ability present in Oracle text. Future provider schema or
indexing changes cannot be ruled out by today's observations. No production
change was justified by this verification. The PR review thread records the
full live-query evidence and test results.
