# Approved functional wireframes for #247

This directory contains repository-local copies of **seven Product Owner-approved mobile functional wireframes** from [issue #247](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/247), covering quick-profile claim invitation management, share/QR, preview, confirmation and error states.

**Archive status: PO-approved visual archive (2026-11-13).** All seven scenario images are uploaded and individually visually inspected. **The Product Owner explicitly accepts the two committed JPEGs for wireframes 01 and 02 as sufficient visual documentation**; images 03–07 remain PNG. No replacement or format conversion is required for this visual archive. The original external GitHub attachment bytes were not independently retrieved, so this acceptance **does not claim byte-for-byte identity, original PNG encoding or lossless archival preservation**.

The approved written specification in #247 remains authoritative for runtime behavior, security and error handling. These functional wireframes govern hierarchy, controls, grouping and navigation, not pixel-perfect styling or decorative design.

## Verified repository image mapping

All image files below are the **actual committed filenames**. Every file was independently opened; numbers, labels and scenario contents match issue #247.

| Scenario | Repository image | Verified format/dimensions | Original issue attachment reference |
| --- | --- | --- | --- |
| **01 v1 — No active / active claim invitation** | [`issue247_wireframe_01_gesamt.jpg`](issue247_wireframe_01_gesamt.jpg) | JPEG, 2080 × 2240 | [Original 01](https://github.com/user-attachments/assets/3467c862-00e7-4919-91aa-d848c5985741) |
| **02 v1 — Created link and expandable local QR** | [`issue247_wireframe_02_link_und_qr_gesamt.jpg`](issue247_wireframe_02_link_und_qr_gesamt.jpg) | JPEG, 2080 × 2240 | [Original 02](https://github.com/user-attachments/assets/4f89aae4-cf8c-40e6-a698-9c329356364a) |
| **03 v1 — Replace and revoke confirmations** | [`issue247_wireframe_03_bestaetigungen_gesamt.png`](issue247_wireframe_03_bestaetigungen_gesamt.png) | PNG, 2080 × 2240 | [Original 03](https://github.com/user-attachments/assets/70a85288-33dc-476e-a076-cdfe0292c723) |
| **04 v2 — Signed-out and authenticated claim preview** | [`issue247_wireframe_04_v2_gesamt.png`](issue247_wireframe_04_v2_gesamt.png) | PNG, 1888 × 2260 | [Original 04](https://github.com/user-attachments/assets/6dc5dff4-835c-49b9-a9d1-c2492a4e3254) |
| **05 v1 — Final explicit acceptance confirmation** | [`issue247_wireframe_05_bestaetigungsdialog_v1.png`](issue247_wireframe_05_bestaetigungsdialog_v1.png) | PNG, 1710 × 3180 | [Original 05](https://github.com/user-attachments/assets/a547bcbb-b91e-4048-b8f8-3af78b56338f) |
| **06 v1 — Same-game 409 conflict and ambiguous accept response** | [`issue247_wireframe_06_fehler_gesamt_v1.png`](issue247_wireframe_06_fehler_gesamt_v1.png) | PNG, 2060 × 2240 | [Original 06](https://github.com/user-attachments/assets/e51a749d-dde5-4904-95d4-2c007fe94a1d) |
| **07 v1 — Invalid 400, transient failures and rate limit 429** | [`issue247_wireframe_07_fehler_gesamt_v1.png`](issue247_wireframe_07_fehler_gesamt_v1.png) | PNG, 4002 × 3228 | [Original 07](https://github.com/user-attachments/assets/dd21c484-67b5-4272-80ec-1bdf3d309531) |

**Binding version rule:** Wireframe **04 v2** supersedes 04 v1. Earlier draft annotations such as "not yet approved" within an image are historical image content; the PO subsequently approved the seven specific revisions in #247. The accepted issue specification, not the image's old draft legend, establishes approval.

## Verification and limitations

- **Verified:** seven repository image files plus this README in PR #304; no other files in its changed-file list at the upload revision.
- **Verified:** inspected all seven files visually and matched the visible scenario contents, version and UI controls to #247.
- **Verified:** PNG signatures and IHDR dimensions for 03–07; JPEG signatures and image dimensions for 01–02.
- **Verified:** Markdown relative links exactly match the committed filenames.
- **Not verified:** external original attachment byte equality; no claim that JPEG 01/02 are original PNG binaries or losslessly preserved.
- **Not run:** application builds, unit/integration tests or browser tests (documentation-only).
- **PO decision (2026-11-13):** JPEGs 01 and 02 are accepted for this **visual wireframe archive**; no PNG replacement is required. This explicitly resolves the prior format decision without changing the original external-attachment provenance limitation.
- **Before archive merge:** Verify required CI on the final PR HEAD and complete independent review. The PO alone may merge.

## Implementation preflight and scope

When implementing #247, read the complete issue and **open each repository image individually**. The source links and this README do not substitute for visual inspection. Reuse #200's completed sharing, QR and auth-return infrastructure while enforcing #247's distinct OWNER/ADMIN issuer rights, one-hour claim links, explicit data merge and error states. Backend #224 is already complete.

No production code, backend/API, tests or approved product requirements are changed by this archive. This documentation PR does **not** authorize implementing #247, merging or deployment; these remain separate PO decisions. Coordinate through [initiative #172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172).
