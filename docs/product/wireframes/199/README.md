# Approved functional wireframes for #199

This directory is the repository-local archive for the **three Product Owner-approved mobile wireframe PNGs** attached to [issue #199](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/199) (read-only playgroup member decks).

**Archive status: awaiting original PNG uploads.** This README has been staged in advance; no PNG is included in this draft commit. The approved issue specification and its original GitHub attachments remain authoritative. Do not treat the proposed local filenames below as existing or the archive as complete until the corresponding files are uploaded and verified.

## Approved source images and upload manifest

| Scenario | Proposed local filename (pending upload) | Authoritative issue attachment | Dimensions stated in issue |
| --- | --- | --- | --- |
| 01 — Read-only deck overview: one Commander, partner pair, Companion, conditional ManaBox action | `issue199_wireframe_01_member_decks_overview_mobile_v1.png` | [Original 01](https://github.com/user-attachments/assets/54ec469e-4961-4d29-a444-d896df79013c) | 852 × 1822 |
| 02 — Overflow-dependent scrolling/search, Commander search and no matches (02a–02c) | `issue199_wireframe_02_deck_search_scroll_mobile_v1.png` | [Original 02](https://github.com/user-attachments/assets/45ab7c9a-40d8-4b17-bd8a-56283a40182a) | 2500 × 1822 |
| 03 — No eligible decks, inactive target and lost group access (03a–03c) | `issue199_wireframe_03_empty_access_states_mobile_v1.png` | [Original 03](https://github.com/user-attachments/assets/fd476380-282c-4f54-bd18-7c4990daf13c) | 2500 × 1822 |

The local filenames are staging proposals, **not claims about the originals' filenames**. If the PO uploads the unmodified original files with different names, reconcile this manifest to the filenames actually committed. Do not rename or regenerate approved image content merely to match this table.

## Binding scope

Issue #199's written contract governs permissions, deck ordering, read-only interactions, the shared full-card viewer, search, and error/access-loss handling. These images govern functional hierarchy, control placement and grouping rather than pixel-perfect styling or decorative appearance.

- The entry point is the completed Members directory from #198 (merged via PR #293).
- The backend authorized member-deck read and per-deck ManaBox URL support from #238 (merged via PR #240) are available.
- The shared full-card viewer foundation from #222 is already implemented; the later #239 viewer presentation refinement and #235 token accordion remain separate work.
- No member-deck editing, generic member-profile page, backend API change, or #199 implementation is authorized by this archive PR.

## Upload and verification checklist

- [ ] Product Owner uploads **all three original approved PNG files** to branch `docs/199-wireframes`, under `docs/product/wireframes/199/`.
- [ ] Update the manifest to use the **actual committed filenames**; link each local PNG when present.
- [ ] Verify each repository file is a valid PNG and inspect its **actual dimensions** against the issue's stated dimensions; record results without inventing byte-for-byte comparisons.
- [ ] **Individually view all three repository PNGs** to verify that they show the approved scenarios and correct order; a file listing or README description is not sufficient.
- [ ] Verify the documentation PR diff, Reviewer Context and current-HEAD required checks; the PO alone decides whether to merge.
- [ ] After archive merge, any #199 implementation requires a **separate explicit PO authorization**, branch, review and PR. The implementing agent must visually inspect all three archived PNGs before browser-visible work.

No implementation code, tests, or UI behavior should change in this documentation PR.
