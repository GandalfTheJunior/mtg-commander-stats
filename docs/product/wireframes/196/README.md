# Approved functional wireframes for #196

This directory holds repository-local copies of the seven **Product Owner-approved
functional mobile wireframes** attached to [issue #196](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/196)
(Record/Edit Match). Its approved written requirements and linked original
attachments remain authoritative. The copies allow repository-scoped coding
agents to inspect the actual images when GitHub issue attachments return HTTP 403.

## Files and original issue attachments

The original filenames have been preserved. The table is ordered by **functional
scenario**, not by the attachment order in the issue. The attachment links and
PNG dimensions make the correspondence explicit.

| Approved scenario | Repository PNG | Original issue attachment | PNG size |
| --- | --- | --- | --- |
| Normal WIN entry | [`wireframe_196_spiel_erfassen_v2.png`](wireframe_196_spiel_erfassen_v2.png) | [Original 5](https://github.com/user-attachments/assets/2f8717e8-fc14-4112-96c2-b307dbdfe670) | 1220 × 2980 |
| Member picker | [`wireframe_196_mitgliederauswahl_v1.png`](wireframe_196_mitgliederauswahl_v1.png) | [Original 7](https://github.com/user-attachments/assets/cf447d93-0fa9-4dbb-b8a3-f6bfb1348e83) | 1220 × 2050 |
| Deck picker | [`wireframe_196_deckauswahl_v1.png`](wireframe_196_deckauswahl_v1.png) | [Original 2](https://github.com/user-attachments/assets/9db00ba6-9d90-40db-b125-9757bfd38215) | 952 × 1600 |
| Alternative WIN | [`wireframe_196_alternativer_sieg_v1.png`](wireframe_196_alternativer_sieg_v1.png) | [Original 4](https://github.com/user-attachments/assets/001dddf7-a273-419a-ae1d-46e4d2a25fa2) | 915 × 2235 |
| DRAW | [`wireframe_196_unentschieden_v1.png`](wireframe_196_unentschieden_v1.png) | [Original 6](https://github.com/user-attachments/assets/1f6ffb39-77b2-44a4-b415-9be2506ac4d1) | 915 × 2160 |
| Incomplete-ranking confirmation | [`wireframe_196_fehlende_platzierungen_v1.png`](wireframe_196_fehlende_platzierungen_v1.png) | [Original 1](https://github.com/user-attachments/assets/30283ccc-be67-4420-aa16-4e966628b570) | 915 × 2235 |
| Post-save success | [`wireframe_196_erfolgsbestaetigung_v2.png`](wireframe_196_erfolgsbestaetigung_v2.png) | [Original 3](https://github.com/user-attachments/assets/087d2ee2-c91d-4b86-a4cc-3a9ca9decb12) | 1220 × 2580 |

## Verification and handoff

- All seven PNG files are present in `docs/196-wireframes` and have valid PNG
  signatures and the dimensions recorded above.
- The repository files have been opened for visual inspection. Their scenario
  names correspond to the images, including the post-save success panel.
- **Not yet verified:** Byte-for-byte identity against the external GitHub issue
  attachments; those assets may be inaccessible to restricted clients.
- **Not yet verified:** Whether the intended Claude Code session can open each
  image from the branch. The Product Owner should request this explicit preflight
  before starting implementation.

This is **documentation only**. Neither archiving these images nor merging this
PR authorizes #196 implementation. For the binding specification and approval
gates, use [#196](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/196),
[parent initiative #172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172),
and `AGENTS.md`.
