# Approved functional wireframes for #198

This directory contains repository-local copies of the **seven Product
Owner-approved mobile wireframes** from [issue #198](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/198)
(Members directory, management, quick profiles, and ownership transfer).

The approved written specification and original issue attachments remain
authoritative. These copies allow coding agents to inspect the actual PNGs
when external GitHub issue attachments cannot be accessed.

## Approved wireframes

All seven original files have been uploaded to `docs/198-wireframes` with
their existing filenames. The table maps each approved scenario to its
repository-local PNG in issue order.

| Approved scenario | Repository PNG | Original issue attachment | Verified dimensions |
| --- | --- | --- | --- |
| 01 — Members directory, v2 | [`issue198_wireframe_01_mitgliederuebersicht_mobile_v2.png`](issue198_wireframe_01_mitgliederuebersicht_mobile_v2.png) | [Original 01](https://github.com/user-attachments/assets/4e4ec31d-f6a7-4d3a-916f-7f823d4acfdd) | 852 × 1822 |
| 02 — Member and quick-profile action menus, v1 | [`issue198_wireframe_02_aktionsmenues_mobile_v1.png`](issue198_wireframe_02_aktionsmenues_mobile_v1.png) | [Original 02](https://github.com/user-attachments/assets/96eb70b0-3c83-4e98-bccd-7608a7ea8e59) | 2500 × 1822 |
| 03 — Confirmation dialogs, v2 | [`issue198_wireframe_03_bestaetigungsdialoge_mobile_v2.png`](issue198_wireframe_03_bestaetigungsdialoge_mobile_v2.png) | [Original 03](https://github.com/user-attachments/assets/a4c7f514-2507-4aea-91c2-5e5418052497) | 2500 × 1822 |
| 04 — Create and rename quick profile, v2 | [`issue198_wireframe_04_schnellprofil_erstellen_umbenennen_mobile_v2.png`](issue198_wireframe_04_schnellprofil_erstellen_umbenennen_mobile_v2.png) | [Original 04](https://github.com/user-attachments/assets/9ee04d2f-46db-43df-8d7d-2ec48ec1e7bb) | 2500 × 1822 |
| 05 — Ownership offer and pending request, OWNER v2 | [`issue198_wireframe_05_eigentuemer_angebot_mobile_v2.png`](issue198_wireframe_05_eigentuemer_angebot_mobile_v2.png) | [Original 05](https://github.com/user-attachments/assets/6a52cb85-6318-404c-8b78-829c76f893af) | 1676 × 1822 |
| 06 — Ownership offer acceptance, ADMIN v2 | [`issue198_wireframe_06_admin_uebernahme_mobile_v2.png`](issue198_wireframe_06_admin_uebernahme_mobile_v2.png) | [Original 06](https://github.com/user-attachments/assets/13784179-9f5b-443e-ae52-5b2e23dd8627) | 2500 × 1822 |
| 07 — Empty search/filter and leave dialog, v3 | [`issue198_wireframe_07_leerzustaende_austritt_mobile_v3.png`](issue198_wireframe_07_leerzustaende_austritt_mobile_v3.png) | [Original 07](https://github.com/user-attachments/assets/ea3570f5-12a2-4390-b8b2-a458bafc35e3) | 2500 × 1822 |

## Important approved cross-wireframe rule

The **same-row "Spieler einladen" and "+ Schnellprofil erstellen" action
placement from wireframe 01 v2 applies to every view**, superseding any older
stacked-button illustration in wireframe 02 v1. The written contract in #198
governs all behaviors, permissions, confirmations and conflict handling.

## Verification and delivery

- **Present:** all seven PNG files on `docs/198-wireframes`.
- **Verified:** PNG signatures, dimensions and the visual content of all seven
  scenarios were inspected directly from the repository files.
- **Not independently verified:** exact byte-for-byte equality with the
  external issue attachment originals, which may be inaccessible from
  restricted clients.
- **Claude Code preflight:** before implementing #198, the intended agent must
  individually open and visually inspect all seven repository PNGs. File
  listings, dimensions and Markdown descriptions are not sufficient.
- **Before archive merge:** complete independent review and required GitHub CI
  checks for the current PR HEAD. The PO retains merge authority.
- **After archive merge:** #198 implementation needs a separate, explicit PO
  authorization and a dedicated feature branch/PR.

The images govern functional hierarchy and layout, not exact pixels,
decorative styling or illustrative names. This documentation PR does not
authorize implementation of #198, distinct #199/#200 views, or new backend
contracts. Follow `AGENTS.md` and [initiative #172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172).
