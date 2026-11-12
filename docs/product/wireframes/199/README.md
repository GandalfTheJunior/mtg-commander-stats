# Approved functional wireframes for #199

This directory contains repository-local PNG copies of the **three Product Owner-approved mobile wireframes** from [issue #199](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/199) (read-only playgroup member decks).

**Archive status: all three PNG files uploaded and verified.** The approved written specification and original issue attachments remain authoritative. These local files let coding agents inspect the actual PNGs when external GitHub issue attachments are inaccessible.

## Approved wireframes

The filenames in this table are the **actual committed names**, preserved without renaming any uploaded image.

| Scenario | Repository PNG | Original issue attachment | Verified dimensions |
| --- | --- | --- | --- |
| 01 — Member deck overview: one/paired Commanders, Companion, conditional ManaBox link | [`6a9e61c108521a3f64584ae065acaaf9.png`](6a9e61c108521a3f64584ae065acaaf9.png) | [Original 01](https://github.com/user-attachments/assets/54ec469e-4961-4d29-a444-d896df79013c) | 852 × 1822 |
| 02 — Overflow deck list (02a), Commander-name search (02b), no matches (02c) | [`cc9742f6590924ee3a2aaf6b24e852c0.png`](cc9742f6590924ee3a2aaf6b24e852c0.png) | [Original 02](https://github.com/user-attachments/assets/45ab7c9a-40d8-4b17-bd8a-56283a40182a) | 2500 × 1822 |
| 03 — No eligible decks (03a), target unavailable (03b), group access lost (03c) | [`842fd139b20428fc8bf4ee7bd5136313.png`](842fd139b20428fc8bf4ee7bd5136313.png) | [Original 03](https://github.com/user-attachments/assets/fd476380-282c-4f54-bd18-7c4990daf13c) | 2500 × 1822 |

## Binding scope and cross-issue contracts

Issue #199's written requirements govern permissions, deck ordering, read-only interactions, shared full-card viewing, search, and access/error states. These wireframes govern functional hierarchy, control placement, and grouping rather than pixel-perfect styling or decoration.

- The entry point is the implemented #198 Members directory (merged via PR #293).
- The group-scoped member-decks read and authorized per-deck ManaBox URL support from #238 (merged via PR #240) are available.
- Reuse the existing shared full-card viewer foundation (#222). Later viewer UI refinement #239 and token accordion #235 remain independently scoped.
- The archive authorizes no member-deck editor, generic member profile, new backend endpoint, or #199 implementation.

## Verification and delivery

- **Present:** all three PNGs committed on `docs/199-wireframes`, each linked above using its exact repository filename.
- **Verified:** PNG signatures and header dimensions inspected directly; all three match the dimensions stated in #199.
- **Visually inspected individually:** file 01 depicts the basic deck overview, Commander pair/Companion and ManaBox; file 02 the scrolling list and two search states; file 03 empty, unavailable-member and access-loss states. Scenario mapping matches #199.
- **Not verified:** exact byte-for-byte equality with externally hosted GitHub attachment originals; no claim of a cryptographic match.
- **Implementer preflight:** when beginning #199, open and visually inspect each of these three local PNGs; the README/file listing alone is insufficient.
- **Before documentation PR merge:** check final diff, current-HEAD CI, and reviewer feedback. The PO alone may merge.
- **After documentation PR merge:** implementing #199 requires separate PO authorization on a dedicated feature branch/PR, including UI screenshot evidence and independent review.

No production code, tests, UI behavior, or approved product requirements change in this documentation archive.
