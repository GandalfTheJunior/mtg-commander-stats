# Approved functional wireframes for #200

This directory archives the five uploaded **PO-approved mobile functional wireframes** for [issue #200](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/200), covering invitation creation, public preview, authentication return, error states and successful group joining.

**Archive status: five PNGs present and individually inspected; source-link mapping needs PO confirmation.** The written specification and the issue's approved wireframe **scenarios** remain authoritative. The uploaded files are intact and depict all five approved scenarios, but four uploaded image contents are associated with different original attachment IDs than those listed for the corresponding scenario in the issue. This README records the **visually confirmed** mapping and does not silently reinterpret the issue's source links.

## Repository images — mapped by content, not filename

The uploaded filenames are GitHub-generated and retain attachment-like identifiers; their numbering does **not** correspond to their displayed scenario. Each link below points to the actual committed file, which was opened and visually inspected.

| Visible wireframe content | Repository PNG | Verified PNG dimensions | Source link listed for that scenario in #200 |
| --- | --- | --- | --- |
| **01 v3 — Invite dialog; sharing, copy and expandable QR code** | [`698706827-5c951b90-8acf-4b45-ae38-ec1993ae3845.png`](698706827-5c951b90-8acf-4b45-ae38-ec1993ae3845.png) | 1776 × 1906 | [Issue-listed 01](https://github.com/user-attachments/assets/2881a260-6137-458f-958e-cae1e13f26fc) |
| **02 v2 — Signed-out and authenticated public invitation preview** | [`698706876-3293f007-20fe-4b6a-be04-0f7580d8e698.png`](698706876-3293f007-20fe-4b6a-be04-0f7580d8e698.png) | 1776 × 1906 | [Issue-listed 02](https://github.com/user-attachments/assets/e901694c-0653-4d4e-a89b-997512879de4) |
| **03 v2 — Existing login/registration and return to same invitation** | [`698706723-2881a260-6137-458f-958e-cae1e13f26fc.png`](698706723-2881a260-6137-458f-958e-cae1e13f26fc.png) | 2730 × 2015 | [Issue-listed 03](https://github.com/user-attachments/assets/5c951b90-8acf-4b45-ae38-ec1993ae3845) |
| **04 v1 — Invalid/already-member/temporary-load/create-failure states** | [`698706762-e901694c-0653-4d4e-a89b-997512879de4.png`](698706762-e901694c-0653-4d4e-a89b-997512879de4.png) | 1800 × 3915 | [Issue-listed 04](https://github.com/user-attachments/assets/3293f007-20fe-4b6a-be04-0f7580d8e698) |
| **05 v1 — Successful join and regular Playgroup Overview** | [`698706915-8e936007-b84a-4a70-8a3c-ce6785537ee5.png`](698706915-8e936007-b84a-4a70-8a3c-ce6785537ee5.png) | 852 × 1822 | [Issue-listed 05](https://github.com/user-attachments/assets/8e936007-b84a-4a70-8a3c-ce6785537ee5) |

**Mismatch requiring confirmation:** The uploaded file whose filename ends in `2881a260-...` visibly says **03**, not **01**; the `e901694c-...` file says **04**, not **02**; the `5c951b90-...` file says **01**, not **03**; and the `3293f007-...` file says **02**, not **04**. Image **05** is aligned. The issue Markdown labels its original attachments as 01→2881, 02→e901, 03→5c951, 04→3293, 05→8e936. The visual file contents and that source mapping disagree. The external attachment binaries were not independently retrieved, so their byte identity and the reason for the mismatch remain unverified.

## Verification

- **PASS:** Five distinct committed PNGs and this README, with no other changed files in the archive PR at the upload revision.
- **PASS:** Opened each PNG individually and examined its visible title, revision, controls and scenarios; combined contents cover all five approved scenarios in #200.
- **PASS:** Checked PNG signatures and IHDR dimensions listed in the table.
- **PASS:** Each local Markdown file link uses the exact GitHub-committed filename.
- **OPEN:** PO to confirm the intended mapping/provenance and, if necessary, correct the source attachments or the issue's links before this archive is called final.
- **NOT VERIFIED:** Byte-for-byte equality with the original external issue attachments.
- **NOT RUN:** Frontend/backend runtime tests or builds (documentation-only PR). Final current-HEAD CI and reviewer feedback must be checked before merge.

The functional wireframes govern hierarchy, control placement, content grouping and navigation, not pixel-perfect styling or decorative production artwork. The written requirements in #200 govern runtime, security and error contracts.

## Scope boundary

This repository archive changes no production code, tests, APIs, permission rules, authentication or invitation behavior. Backend invitation implementation #187 is already merged; [initiative #172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172) coordinates independently authorized UI slices.

**Do not merge this archive PR until the mismatch is resolved or explicitly accepted by the PO.** Implementing #200 requires a separate PO authorization; an implementation agent must read the issue and **open each of the five actual repository PNGs individually** rather than relying only on their filenames, source links or this README.
