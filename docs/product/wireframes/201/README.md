# Approved functional wireframes for #201

This directory is the repository-local staging area for the **six Product
Owner-approved static mobile wireframes** linked in [issue #201](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/201)
(Personal Decks collection and create/edit flow). The issue's written
specification and original approved attachments remain authoritative.

The Product Owner will add the **original PNG files unchanged** to this
directory on the `docs/201-wireframes` branch. This is a documentation-only
access workaround for coding agents that cannot visually inspect GitHub issue
attachments. The filenames below are proposed repository names; if the
uploaded originals retain their existing names, update this table to match
instead of renaming unnecessarily.

**Current status: awaiting all six PNG uploads.** The links in the last
column point to the originals attached to #201; they do not mean that
repository-local copies are present or readable yet.

| Approved scenario | Proposed repository filename | Original attachment | Expected dimensions |
| --- | --- | --- | --- |
| 01 — My Decks collection | `01-my-decks.png` | [Original 01](https://github.com/user-attachments/assets/d656844d-7e02-47ba-98af-e146a98bec25) | 852 × 1822 |
| 02 — Create Deck | `02-create-deck.png` | [Original 02](https://github.com/user-attachments/assets/dbac4869-0e4d-418c-a8e9-bfe8a87d120a) | 852 × 2100 |
| 03 — Edit Deck (two Commanders and genuine Companion) | `03-edit-deck.png` | [Original 03](https://github.com/user-attachments/assets/71b5b57c-4b2f-4f24-a97c-ee16e7f736f7) | 852 × 2650 |
| 04 — Confirmation dialogs | `04-confirmation-dialogs.png` | [Original 04](https://github.com/user-attachments/assets/59e83fcd-05ed-4bbc-a2a6-28cda981037e) | 2772 × 2086 |
| 05 — Validation and save recovery | `05-validation-save-recovery.png` | [Original 05](https://github.com/user-attachments/assets/b6691d20-1c18-4190-8314-ecf9aec79868) | 2772 × 2094 |
| 06 — Commander search and dependent selections | `06-commander-search.png` | [Original 06](https://github.com/user-attachments/assets/86fda474-344c-4d37-b0ed-ca23a9f3d182) | 1988 × 4022 |

## Completion checklist for this documentation PR

1. Upload all six original PNGs as separate repository files beside this README.
   Do not embed, redraw, crop, regenerate or otherwise substitute the images.
2. Align this index with the actual uploaded filenames and verify scenario order
   and PNG dimensions against the approved issue attachments.
3. Ask the intended Claude Code session to **open and visually inspect each of
   the six PNG files** on this branch. Filenames or Markdown-only access do not
   count as visual verification.
4. Review the documentation-only diff, complete required CI and independent
   review, and let the PO decide whether to merge.
5. Only after the archive is merged may a separately PO-authorized implementer
   work on #201 using the repository-local wireframes on `main`.

Archiving the files **does not authorize implementation of #201**, change its
specification or supersede the project workflow in `AGENTS.md` and
[parent initiative #172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172).
