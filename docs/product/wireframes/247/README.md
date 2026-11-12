# Approved functional wireframes for #247

This directory is the planned repository-local archive for the **seven Product Owner-approved mobile functional wireframes** attached to [issue #247](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/247): quick-profile claim invitation management, sharing, public preview, explicit confirmation, and errors.

**Archive status: INCOMPLETE — the seven original PNGs are not yet committed here.** The approved written issue specification and original attachments remain authoritative. This manifest alone is not proof that the binaries are available. Keep the documentation PR as a draft until all seven files are uploaded, individually inspected, and linked using their **actual committed filenames**.

## Approved source images

| # | Approved scenario | Approved revision | Original issue attachment |
| --- | --- | --- | --- |
| 01 | Invitation status: no active invitation / active invitation | v1 | [Original 01](https://github.com/user-attachments/assets/3467c862-00e7-4919-91aa-d848c5985741) |
| 02 | Fresh invitation link and expanded local QR code | v1 | [Original 02](https://github.com/user-attachments/assets/4f89aae4-cf8c-40e6-a698-9c329356364a) |
| 03 | Deliberate replace/revoke confirmation dialogs | v1 | [Original 03](https://github.com/user-attachments/assets/70a85288-33dc-476e-a076-cdfe0292c723) |
| 04 | Public claim preview, signed out / signed in, including decline | **v2** | [Original 04](https://github.com/user-attachments/assets/6dc5dff4-835c-49b9-a9d1-c2492a4e3254) |
| 05 | Explicit claim acceptance confirmation | v1 | [Original 05](https://github.com/user-attachments/assets/a547bcbb-b91e-4048-b8f8-3af78b56338f) |
| 06 | Same-game 409 conflict and ambiguous accept response | v1 | [Original 06](https://github.com/user-attachments/assets/e51a749d-dde5-4904-95d4-2c007fe94a1d) |
| 07 | Generic invalid 400, transient failure and 429 rate-limit states | v1 | [Original 07](https://github.com/user-attachments/assets/dd21c484-67b5-4272-80ec-1bdf3d309531) |

**Version rule:** Wireframe **04 v2 supersedes 04 v1**. Preserve exactly the approved composite views; do not substitute obsolete individual panels or generated approximations.

## Upload and verification gate

1. Upload the **seven original, unmodified PNG files** to branch `docs/247-wireframes` under `docs/product/wireframes/247/`. Do not upload to `main`.
2. After uploading, update this table to link every **actual committed filename**. Compare each PNG's *visible scenario number and revision* to its content, not merely its GitHub-generated attachment filename. The #200 archive revealed that embedded attachment IDs can be misleading.
3. Independently open **all seven** repository PNG files. Verify PNG signatures, IHDR dimensions, visual scenarios and readable states. Do not assert byte-for-byte equality with the originals unless the external image binaries can be independently compared.
4. Confirm the final PR diff contains **exactly seven PNGs plus this README**, with no app code or other changes; recheck current-HEAD CI and reviewer feedback before PO merge.
5. An agent implementing #247 must open all seven *repository-local PNGs* and read the complete written specification before coding. A listing or README alone is insufficient.

**Current checks:** Seven approved scenario/revision descriptions and original attachment URLs were transcribed from #247. The binary files were inaccessible via the available GitHub attachment access, so **PNG signatures, dimensions, image content and original-byte identity have not been checked**. All seven binary uploads and final verification remain outstanding.

## Scope and product boundaries

This is a **documentation-only image archive**, not a change to any production UI, backend/API, tests or product decisions. The #247 frontend implementation must follow completed #200 invitation sharing/auth-return patterns while respecting **distinct** quick-profile semantics: OWNER/ADMIN issuer permissions, one-hour single-use claim link, explicit acceptance, protected target identity and data transfer. The backend prerequisite #224 is already complete.

Do not merge this archive until its seven PNGs and final verified manifest are present. This PR does **not** authorize implementing #247; that requires the PO's separate approval and a dedicated feature branch/PR. Coordinate through [initiative #172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172).
