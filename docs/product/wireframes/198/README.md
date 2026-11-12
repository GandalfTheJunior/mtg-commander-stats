# Approved functional wireframes for #198

This directory is a repository-local staging area for the **seven
Product Owner-approved mobile wireframes** from [issue #198](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/198)
(Members directory, management, quick profiles, and ownership transfer).

The issue's written specification and its original approved attachments remain
authoritative. These PNG copies will let coding agents visually inspect the
approved functional layout when GitHub issue attachments are inaccessible.

**Archive status: awaiting upload of all seven original PNGs.** Filenames
below are suggestions, not existing repository files. Preserve uploaded
original filenames when practical and reconcile this table after upload.

| Approved scenario | Suggested local filename | Original attachment | Expected PNG dimensions |
| --- | --- | --- | --- |
| 01 — Members directory, v2 | `01-members-directory-v2.png` | [Original 01](https://github.com/user-attachments/assets/4e4ec31d-f6a7-4d3a-916f-7f823d4acfdd) | 852 × 1822 |
| 02 — Member and quick-profile action menus, v1 | `02-member-actions-v1.png` | [Original 02](https://github.com/user-attachments/assets/96eb70b0-3c83-4e98-bccd-7608a7ea8e59) | 2500 × 1822 |
| 03 — Confirmation dialogs, v2 | `03-confirmations-v2.png` | [Original 03](https://github.com/user-attachments/assets/a4c7f514-2507-4aea-91c2-5e5418052497) | 2500 × 1822 |
| 04 — Create and rename quick profile, v2 | `04-quick-profiles-v2.png` | [Original 04](https://github.com/user-attachments/assets/9ee04d2f-46db-43df-8d7d-2ec48ec1e7bb) | 2500 × 1822 |
| 05 — Ownership offer and pending request, OWNER v2 | `05-owner-transfer-offer-v2.png` | [Original 05](https://github.com/user-attachments/assets/6a52cb85-6318-404c-8b78-829c76f893af) | 1676 × 1822 |
| 06 — Ownership offer acceptance, ADMIN v2 | `06-admin-transfer-accept-v2.png` | [Original 06](https://github.com/user-attachments/assets/13784179-9f5b-443e-ae52-5b2e23dd8627) | 2500 × 1822 |
| 07 — Empty search/filter and leave dialog, v3 | `07-empty-and-leave-v3.png` | [Original 07](https://github.com/user-attachments/assets/ea3570f5-12a2-4390-b8b2-a458bafc35e3) | 2500 × 1822 |

## Important approved cross-wireframe rule

The **same-row "Spieler einladen" and "+ Schnellprofil erstellen" action
placement from wireframe 01 v2 applies to every view**, superseding any older
stacked-button illustration in wireframe 02 v1. The written contract in #198
controls all behaviors, permissions, confirmations and conflict handling.

## Completion checklist for this documentation PR

1. The PO uploads all seven **unchanged original PNG files** to this directory
   on branch `docs/198-wireframes`. Do not crop, redraw or regenerate them.
2. Update the index to link the **actual repository filenames**, and inspect
   each PNG's file signature, dimensions, visual state and ordering.
3. Verify that the intended Claude Code implementer can **visually open all
   seven PNGs individually**. Reading filenames or Markdown descriptions
   alone does not qualify.
4. Complete normal documentation-only PR review and required CI checks. The
   PO alone decides whether to merge.
5. Implementation of #198 requires **separate explicit PO authorization**,
   even after this archive reaches `main`.

The images are approved for functional layout and grouping, not for exact
pixels, decorative styling or illustrations. This archive does not authorize
the distinct #199 member deck UI, #200 invitation UI, new backend APIs, or
implementation of #198. Follow `AGENTS.md` and [initiative #172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172).
