# PO-approved mobile functional wireframe for #235

> **Archive incomplete — original image binary pending.** This directory stages the repository-local archive of the one Product Owner-approved mobile v1 wireframe attached to [issue #235](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/235). The README alone is **not** a substitute for the image and must not be treated as completed visual evidence.

## Authoritative references

- **Owning specification:** [#235 — Scryfall-linked tokens accordion in full-card dialog](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/235).
- **Original PO-approved mobile v1 attachment:** [GitHub issue attachment](https://github.com/user-attachments/assets/97f82238-0ee1-40b2-a75d-4fb7f8affbab), approved on 2026-11-09.
- **Completed shared viewer prerequisite:** [#239, merged via PR #313](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/313).
- **Completed backend token snapshot prerequisite:** [#234](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/234).

The approved wireframe governs the **accordion's location, collapsed/expanded controls, one-column token-card arrangement and relative visual hierarchy**, not exact pixels, styling or decorative effects. The #235 written contract governs data integration, access, states, errors, accessibility and all other runtime behavior. A separate desktop wireframe is **not required**.

## Completion gate for this documentation PR

1. Download the **original approved wireframe** from #235 and upload the real image file into this directory on branch `docs/235-wireframe`. Do not recreate, generate or restyle it.
2. Add a repository-relative Markdown link to its **actual committed filename**, with verified format and pixel dimensions if available.
3. Open the committed image visually, compare its controls and layout against the original issue attachment, and record the checks performed. Never claim byte-for-byte original provenance without verifying it.
4. Ensure the changed-file list contains only the image and this README, then complete independent review and current-HEAD required CI before PO-only merge.

**Current limitation:** the approved issue attachment is reachable as an issue URL, but could not be downloaded as a binary with the available tool access. No image has yet been committed or independently inspected here.

## Implementation handoff after archive merge

The separate PO-authorized #235 implementation must **open the actual committed repository image** and read the full issue. Extend the one already-merged `frontend/src/FullCardView.tsx` from #239, consuming only #234's stored, authorized nullable `relatedTokens` snapshots. The saved Commander's token relationships do not change on face flip. Do not implement new token metadata endpoints, extra dialogs, Companion tokens, gameplay counters, or decorative redesign.

Suggested hands-on PO acceptance examples from iPhone testing: **Sorin of House Markov // Sorin, Ravenous Neonate** (Food token associated with the saved Commander printing, independently of the visible face) and **Koma, Cosmos Serpent** (3/3 blue Serpent creature token named Koma's Coil). Before asserting a token ought to appear in these particular decks, verify that their saved printing's Scryfall-linked snapshot actually contains the corresponding token. These are implementation/verification notes, **not** new behavioral requirements or permission to infer token relationships from rules text.

This documentation-only PR does **not** authorize #235 implementation or merge.
