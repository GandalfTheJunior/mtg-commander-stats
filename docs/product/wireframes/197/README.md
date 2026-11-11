# Approved functional wireframes for #197

This directory contains repository-local copies of the **seven PO-approved
mobile wireframes** in [issue #197](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/197)
(Playgroup Statistics landing page, chooser, and four focused reports).
The approved issue specification and original GitHub attachments remain
authoritative. Repository copies help coding agents visually inspect the
images when GitHub issue attachments are inaccessible.

## Approved wireframes

The uploaded PNGs retain their original filenames. These files are present
on `docs/197-wireframes` and linked here in approved issue order.

| Approved scenario | Repository PNG | Original issue attachment | Verified dimensions |
| --- | --- | --- | --- |
| 01 — Statistics landing, v2 | [`issue197_wireframe_01_statistik_startseite_mobile_v2.png`](issue197_wireframe_01_statistik_startseite_mobile_v2.png) | [Original 01](https://github.com/user-attachments/assets/a82e7b92-1f49-40bd-b632-6da998a63811) | 780 × 2736 |
| 02 — All Statistics chooser, collapsed v1 | [`issue197_wireframe_02_alle_statistiken_mobile_v1.png`](issue197_wireframe_02_alle_statistiken_mobile_v1.png) | [Original 02](https://github.com/user-attachments/assets/62a9c131-68e7-491a-a2f8-f4a696eff899) | 780 × 1688 |
| 03 — All Statistics chooser, expanded v1 | [`issue197_wireframe_03_alle_statistiken_ausgeklappt_mobile_v1.png`](issue197_wireframe_03_alle_statistiken_ausgeklappt_mobile_v1.png) | [Original 03](https://github.com/user-attachments/assets/58204487-7736-4a36-a938-4e42062620aa) | 780 × 1688 |
| 04 — Player win-rate report, v2 | [`issue197_wireframe_04_spielerbericht_mobile_v2.png`](issue197_wireframe_04_spielerbericht_mobile_v2.png) | [Original 04](https://github.com/user-attachments/assets/4bdbd3d4-b674-4061-be13-557cfeea0529) | 780 × 2784 |
| 05 — Deck win-rate report, v1 | [`issue197_wireframe_05_deckbericht_mobile_v1.png`](issue197_wireframe_05_deckbericht_mobile_v1.png) | [Original 05](https://github.com/user-attachments/assets/3b529372-9272-4bf6-9735-12d604c72cfd) | 780 × 2580 |
| 06 — Starting-seat win-rate report, v1 | [`issue197_wireframe_06_startplatzbericht_mobile_v1.png`](issue197_wireframe_06_startplatzbericht_mobile_v1.png) | [Original 06](https://github.com/user-attachments/assets/cbe9c380-9be8-4822-a458-ed81053c7878) | 620 × 2150 |
| 07 — Compact Mana-color win-rate report, v2 | [`issue197_wireframe_07_manafarbenbericht_mobile_v2.png`](issue197_wireframe_07_manafarbenbericht_mobile_v2.png) | [Original 07](https://github.com/user-attachments/assets/9c2ae1b2-a6ae-40fb-ae4e-a692f7a7584b) | 780 × 1688 |

## Verification and delivery

- **Present:** all seven PNGs on the `docs/197-wireframes` branch.
- **Verified:** PNG file signatures, image dimensions, and all seven visual
  scenarios against the issue's approved descriptions, using the actual
  repository files.
- **Not verified:** binary byte-for-byte identity with the original external
  GitHub issue attachments; the external originals may not be accessible from
  restricted clients.
- **Claude Code preflight:** the intended implementer must individually open
  and **visually inspect all seven repository PNGs**. Filenames, dimensions,
  metadata and README text are not sufficient to satisfy this requirement.
- **Before merging:** complete independent review and required CI verification
  on the current PR HEAD. The PO retains merge authority.
- **After merging:** a separate, explicit PO implementation authorization is
  still required to implement #197 from `main` on a dedicated feature branch.

These images govern functional layout and hierarchy, **not** exact pixels,
decorative styling or illustrative statistics. The source of truth remains
[issue #197](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/197)
and the repository workflow in `AGENTS.md`.
