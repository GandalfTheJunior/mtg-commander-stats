# Approved functional wireframes for #197

This directory will hold repository-local copies of the **seven PO-approved
mobile wireframes** in [issue #197](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/197)
(Playgroup Statistics landing page, chooser, and four focused reports).
The approved issue specification and original GitHub attachments remain
authoritative. Repository copies help coding agents visually inspect the
images when GitHub issue attachments are inaccessible.

**Archive status: awaiting upload of all seven original PNGs.** The table
below records suggested filenames; they are **not yet present** on this
branch. If the original PNGs have other names, preserve their names and
update this table after upload rather than recreating or renaming the images.

| Approved scenario | Suggested local PNG filename | Original issue attachment | Expected dimensions |
| --- | --- | --- | --- |
| 01 — Statistics landing, v2 | `01-statistics-landing-v2.png` | [Original 01](https://github.com/user-attachments/assets/a82e7b92-1f49-40bd-b632-6da998a63811) | 780 × 2736 |
| 02 — All Statistics chooser, collapsed v1 | `02-statistics-chooser-collapsed-v1.png` | [Original 02](https://github.com/user-attachments/assets/62a9c131-68e7-491a-a2f8-f4a696eff899) | 780 × 1688 |
| 03 — All Statistics chooser, expanded v1 | `03-statistics-chooser-expanded-v1.png` | [Original 03](https://github.com/user-attachments/assets/58204487-7736-4a36-a938-4e42062620aa) | 780 × 1688 |
| 04 — Player win-rate report, v2 | `04-player-win-rate-v2.png` | [Original 04](https://github.com/user-attachments/assets/4bdbd3d4-b674-4061-be13-557cfeea0529) | 780 × 2784 |
| 05 — Deck win-rate report, v1 | `05-deck-win-rate-v1.png` | [Original 05](https://github.com/user-attachments/assets/3b529372-9272-4bf6-9735-12d604c72cfd) | 780 × 2580 |
| 06 — Starting-seat win-rate report, v1 | `06-starting-seat-win-rate-v1.png` | [Original 06](https://github.com/user-attachments/assets/cbe9c380-9be8-4822-a458-ed81053c7878) | 620 × 2150 |
| 07 — Compact Mana-color win-rate report, v2 | `07-mana-color-win-rate-v2.png` | [Original 07](https://github.com/user-attachments/assets/9c2ae1b2-a6ae-40fb-ae4e-a692f7a7584b) | 780 × 1688 |

## Archive completion checklist

1. The PO uploads the **seven original PNG files unchanged** alongside this
   README on the `docs/197-wireframes` branch. Do not redraw, crop,
   regenerate, embed in Markdown in place of files, or substitute alternatives.
2. Update this index to link **each actual repository filename**; verify the
   seven scenarios, image formats, dimensions, and visual content.
3. Have the intended Claude Code session **open and visually inspect each of
   the seven actual PNGs** before implementing #197. Filenames, metadata,
   dimensions, and Markdown descriptions alone do not meet this gate.
4. Finish normal documentation PR review and required CI verification on the
   latest HEAD. The PO decides whether to merge this PR.
5. After archive merge to `main`, #197 implementation still requires a
   **separate explicit PO authorization** and a dedicated feature branch/PR.

These images are functional wireframes, **not** an approval of exact pixels,
decorative styling, sample statistics, or fictitious data. The source of
truth remains [issue #197](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/197)
and the repository workflow in `AGENTS.md`.
