# Approved functional wireframes for #200

This directory is the planned repository-local archive for the **five Product Owner-approved mobile wireframes** attached to [issue #200](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/200), covering invitation sharing, preview, authentication return, and joining a Playgroup.

**Archive status: INCOMPLETE — the five PNGs have not yet been committed here.** The original issue attachments and the approved written requirements remain authoritative. This README is an upload manifest, not evidence that the image files are already available. Do **not** treat this documentation PR as ready to merge until all five original PNGs are committed, inspected and linked using their actual committed filenames.

## Five approved source images

| # | Approved scenario | Approved revision | Original issue attachment |
| --- | --- | --- | --- |
| 01 | Invitation-creation dialog, Share/Copy, one-time expiry and expandable QR code | v3 | [Original 01](https://github.com/user-attachments/assets/2881a260-6137-458f-958e-cae1e13f26fc) |
| 02 | Public signed-out and authenticated invitation previews | v2 | [Original 02](https://github.com/user-attachments/assets/e901694c-0653-4d4e-a89b-997512879de4) |
| 03 | Existing registration/sign-in and safe return to the same invitation | v2 | [Original 03](https://github.com/user-attachments/assets/5c951b90-8acf-4b45-ae38-ec1993ae3845) |
| 04 | Unavailable invitation, already-member, preview loading/error and creation failure states | v1 | [Original 04](https://github.com/user-attachments/assets/3293f007-20fe-4b6a-be04-0f7580d8e698) |
| 05 | Confirmed successful join, notice and the existing Playgroup Overview | v1 | [Original 05](https://github.com/user-attachments/assets/8e936007-b84a-4a70-8a3c-ce6785537ee5) |

The **approved revisions above supersede any earlier drafts**. Read each scenario together with the written contract in #200; these are functional wireframes governing layout hierarchy, control inventory and transitions, not pixel-perfect styling or decoration.

## Upload and verification gate

1. Upload **all five original, unaltered PNG files** from the issue attachments onto branch `docs/200-wireframes` under `docs/product/wireframes/200/`. Suggested human-readable filenames are `01_invitation_dialog_qr_v3.png`, `02_invitation_preview_v2.png`, `03_authentication_return_v2.png`, `04_invitation_error_states_v1.png`, and `05_successful_join_v1.png`; preserving actual uploaded filenames is also acceptable.
2. Reconcile this README with the **actual committed names** and add Markdown links to every committed PNG; do not claim the files exist before verifying them.
3. Open and visually inspect **each of the five** repository PNGs individually. Record verified PNG signatures, image dimensions and scenario mapping. Do not claim byte-for-byte equality with external attachments unless directly verified.
4. Check the final changed-file list contains only the manifest and the five original PNGs, and verify current-HEAD CI and reviewer feedback before PO merge.

**Current verification:** original attachment URLs and their approved scenario/revision mapping were checked against #200. None of the five image binaries could be retrieved through the connected GitHub tools, so **no PNG integrity, dimensions, visual contents or equality checks have been performed**.

## Scope boundary

No app code, tests, backend API, product behavior, or approved requirements are changed by this archive. The existing one-time invitation backend is #187 (merged PR #207), the invitation UI specification is #200, and the overall coordination issue is [#172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172).

This documentation PR does **not** authorize implementing #200, deploying invitation routes, or merging any pull request. A subsequent implementation agent must inspect all five **actual PNG files** before starting the separately authorized UI feature.
