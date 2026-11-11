# Approved functional wireframes for #201

This directory contains repository-local copies of the **six Product
Owner-approved static mobile wireframes** linked in [issue #201](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/201)
(Personal Decks collection and create/edit flow). The written specification
and original issue attachments remain authoritative. These repository files
allow coding agents to inspect the actual PNGs when GitHub issue attachments
are blocked.

## Approved wireframes

The uploaded originals retain their filenames (including the separate
`Deckeditor_Wireframe_04.png` for the confirmation dialogs). The table lists
the approved scenarios in issue order.

| Approved scenario | Repository PNG | Original attachment | PNG dimensions |
| --- | --- | --- | --- |
| 01 — My Decks collection | [`wireframe_201_01_meine_decks.png`](wireframe_201_01_meine_decks.png) | [Original 01](https://github.com/user-attachments/assets/d656844d-7e02-47ba-98af-e146a98bec25) | 852 × 1822 |
| 02 — Create Deck | [`wireframe_201_02_deck_erstellen.png`](wireframe_201_02_deck_erstellen.png) | [Original 02](https://github.com/user-attachments/assets/dbac4869-0e4d-418c-a8e9-bfe8a87d120a) | 852 × 2100 |
| 03 — Edit Deck (two Commanders and genuine Companion) | [`wireframe_201_03_deck_bearbeiten.png`](wireframe_201_03_deck_bearbeiten.png) | [Original 03](https://github.com/user-attachments/assets/71b5b57c-4b2f-4f24-a97c-ee16e7f736f7) | 852 × 2650 |
| 04 — Confirmation dialogs | [`Deckeditor_Wireframe_04.png`](Deckeditor_Wireframe_04.png) | [Original 04](https://github.com/user-attachments/assets/59e83fcd-05ed-4bbc-a2a6-28cda981037e) | 2772 × 2086 |
| 05 — Validation and save recovery | [`wireframe_201_05_fehler_wiederherstellung.png`](wireframe_201_05_fehler_wiederherstellung.png) | [Original 05](https://github.com/user-attachments/assets/b6691d20-1c18-4190-8314-ecf9aec79868) | 2772 × 2094 |
| 06 — Commander search and dependent selections | [`wireframe_201_06_commander_suche_sonderzustaende.png`](wireframe_201_06_commander_suche_sonderzustaende.png) | [Original 06](https://github.com/user-attachments/assets/86fda474-344c-4d37-b0ed-ca23a9f3d182) | 1988 × 4022 |

## Verification and delivery

- **Present:** all six PNG files on branch `docs/201-wireframes`.
- **Verified:** PNG signatures, image dimensions and visual content for each
  scenario were inspected from the actual repository files.
- **Not independently verified:** byte-for-byte identity with the original
  external issue attachments, which may be inaccessible in restricted clients.
- **Required preflight for the intended agent:** open and visually inspect every
  repository PNG in the Claude Code environment. Filenames, Markdown links,
  descriptions and dimensions alone do not count as visual verification.
- **Before merging:** review the documentation-only diff and confirm required
  GitHub checks on the current HEAD. The Product Owner retains merge authority.

After this archive is merged, an implementer **separately authorized by the PO**
may use the files on `main` to implement #201. This documentation PR does not
authorize implementation, amend the approved specification, or supersede the
project's `AGENTS.md` and [parent initiative #172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172).
