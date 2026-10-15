# Agent Poker calibration: observed Codex usage

This is a small record of **Product Owner-reported outcomes** used to calibrate
future [Agent Poker](README.md#agent-poker-planning-aid) estimates. It does not
define the sizes or change the [Issue Refiner's rules](roles/issue-refiner.md#agent-poker).
Keep estimates and usage measurements **out of issue bodies**.

## Initial observations

The reported figures describe approximate usage of the **ChatGPT Plus rolling
five-hour Codex allowance** for each task. They are observations from the PO,
not independently measured token counts or guaranteed shares of a fixed budget.
The 6% for #42 was reported as **additional** usage after #41; these numbers
should not be treated as a controlled experiment or summed without confirming
the quota window and other activity.

| Issue / delivered work | Original Agent Poker estimate | PO-reported consumption | Recommended execution profile | Actual execution profile | Retrospective assessment |
| --- | --- | --- | --- | --- | --- |
| [#41](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/41) — deck-deletion focus management | `Pea` | **5%** | Not recorded | Not conclusively attributed to this issue (see note below) | `Pea` fits |
| [#42](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/42) / [PR #44](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/44) — Agent Poker harness | `Potato` (initial conversation estimate; no size label was assigned) | **6%** | `GPT-6.1 Sol // Medium` | Not confirmed | Overestimated; `Pea` would have fit this observed run |
| [#45](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/45) / [PR #46](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/46) — frontend dependency security patches | `Pea` | **4%** | `GPT-6.1 Sol // Medium` | Not confirmed | `Pea` fits |

**Execution-profile attribution:** The PO reported accidentally selecting
`GPT-6.1 Sol // High` during the discussion of these runs. The conversation
does not conclusively identify which issue used that setting, so it is **not**
assigned to any single row as confirmed actual configuration. The profiles
shown as *recommended* were taken from the issue titles; they are not proof
of what Codex actually ran.

## What these observations suggest

- Two deliberately small tasks were correctly categorized as `Pea`.
- The documentation-focused #42 was initially categorized as `Potato`, but
  its reported 6% consumption was similar to the two `Pea` outcomes. Avoid
  equating the length of a harness specification with high execution cost.
- There are too few observations to infer numerical `Pea`, `Potato` or
  `Pumpkin` cutoffs, or to predict how a different model/effort would perform.
  **Reliable completion remains more important than minimizing usage.**

## Adding future observations

After an implementation and any necessary review corrections, append one
row with its issue/PR, **pre-run estimate**, PO-observed allowance change,
**recommended** profile, **actually selected** profile when confirmed, and
whether the estimate was reasonable. Record follow-up/rework separately if
it materially affected usage; do not silently combine usage from unrelated
runs or rolling quota windows. Mark unconfirmed fields as unknown instead of
inferring them from issue titles.

Only append measured or PO-reported outcomes; this file is observational,
not a numerical scoring algorithm or an instruction to automatically
relabel completed issues.
