# Agent Poker

## Agent Poker planning aid

Agent Poker is a relative complexity estimate for an issue. It is independent of
the agent, model, reasoning effort, client and usage limits, and it describes
neither duration nor priority. Assess four dimensions: **scope breadth** (areas,
layers and files affected), **uncertainty** (unknown causes, open design space),
**risk** (security, data integrity, migrations, concurrency, cutover) and
**verification effort** (new tests, browser/UI evidence, manual or operational
checks). The highest dimension determines the size; a small diff can still be a
Potato or Pumpkin when uncertainty or risk is high.

| Size label | Meaning | Reference issues |
| --- | --- | --- |
| `Pea` 🫛 | One area, a well-understood change, low risk; existing checks largely suffice. | #143 (dev-only dashboard link) |
| `Potato` 🥔 | A feature slice across a few files or one to two layers; design decisions resolved; new tests needed; moderate risk or a contained investigation. | #184 (separate game date: migration and API), #104 (Commander art on deck cards), #129 (flaky navigation with unproven root cause) |
| `Pumpkin` 🎃 | Cross-cutting work (for example backend, frontend and migration), material risk, substantial new verification, or significant remaining uncertainty. Consider independently useful smaller issues. | #116 (Game Records v2 domain, persistence and API), #146 (Codespaces cold-start failure and safe recovery) |

Compare a new issue with the reference issues rather than estimating in absolute
terms. Apply at most one size label per issue; issue bodies carry no estimation
prose, scores or tracking. A size is neither readiness nor implementation approval.
Existing issues keep their current size and title until an authorized refinement
reassesses them. The [Issue Refiner contract](roles/issue-refiner.md#agent-poker)
owns estimation, mutation authority and reassessment.

### Maintaining reference issues

Keep at most three reference issues per size, preferably covering different
areas. When reviewing an implementation of a sized issue, the Reviewer may flag
the issue as a reference candidate in the review, but only when the work clearly
turned out larger or smaller than its size (a calibration signal) or when it
represents a size and area the references do not yet cover. This is a note, not
a required check or merge gate, and it does not change the issue's label. The PO
decides whether to add or replace a reference; an authorized documentation
change then updates the table above.
