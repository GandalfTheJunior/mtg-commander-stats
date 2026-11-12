# Approved functional wireframes for #200

This directory contains the five **Product Owner-approved mobile functional wireframes** for [issue #200](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/200): single-use Playgroup invitation sharing, public preview, authentication return, exceptional states and successful joining.

The **approved written specification in #200** governs behavior, permissions and error states. These wireframes govern functional hierarchy, layout, grouping and navigation, not pixel-precise styling or decorative visuals.

## Verified image mapping

The links use the **actual committed filenames**. Scenario numbers are determined from each image's **visible wireframe title and approved revision**, not from the uploaded filename or its attachment-like identifier. All five files were opened and visually inspected.

| Approved scenario | Repository PNG | Verified dimensions |
| --- | --- | --- |
| **01 v3 — Invite dialog and expandable QR code** | [`698706827-5c951b90-8acf-4b45-ae38-ec1993ae3845.png`](698706827-5c951b90-8acf-4b45-ae38-ec1993ae3845.png) | 1776 × 1906 |
| **02 v2 — Public preview, signed out / signed in** | [`698706876-3293f007-20fe-4b6a-be04-0f7580d8e698.png`](698706876-3293f007-20fe-4b6a-be04-0f7580d8e698.png) | 1776 × 1906 |
| **03 v2 — Existing login/registration and invitation return** | [`698706723-2881a260-6137-458f-958e-cae1e13f26fc.png`](698706723-2881a260-6137-458f-958e-cae1e13f26fc.png) | 2730 × 2015 |
| **04 v1 — Invalid, already-member, loading and creation failures** | [`698706762-e901694c-0653-4d4e-a89b-997512879de4.png`](698706762-e901694c-0653-4d4e-a89b-997512879de4.png) | 1800 × 3915 |
| **05 v1 — Successful join and Playgroup Overview** | [`698706915-8e936007-b84a-4a70-8a3c-ce6785537ee5.png`](698706915-8e936007-b84a-4a70-8a3c-ce6785537ee5.png) | 852 × 1822 |

The issue's inline illustrations use these five **visually verified repository files**, removing any ambiguity for future implementation. **Do not infer a scenario from an uploaded filename's embedded UUID.** The source attachments previously embedded in #200 and the uploaded filenames had inconsistent apparent numbering for 01–04; that numbering is not used as approval evidence.

## Original external attachment provenance (historical only)

The following URLs were formerly embedded under the numbered sections of issue #200. Their original binary contents were **not** independently downloaded or cryptographically compared with the uploaded repository PNGs; therefore this table records only historical issue references, not a verified image-to-image match.

| Former issue section | Former attachment URL |
| --- | --- |
| 01 | [Historical 01](https://github.com/user-attachments/assets/2881a260-6137-458f-958e-cae1e13f26fc) |
| 02 | [Historical 02](https://github.com/user-attachments/assets/e901694c-0653-4d4e-a89b-997512879de4) |
| 03 | [Historical 03](https://github.com/user-attachments/assets/5c951b90-8acf-4b45-ae38-ec1993ae3845) |
| 04 | [Historical 04](https://github.com/user-attachments/assets/3293f007-20fe-4b6a-be04-0f7580d8e698) |
| 05 | [Historical 05](https://github.com/user-attachments/assets/8e936007-b84a-4a70-8a3c-ce6785537ee5) |

## Verification and delivery

- **Verified:** exactly five distinct PNGs; each was retrieved from the repository, opened individually and checked for PNG signature, IHDR dimensions, visible scenario number/revision and expected screens.
- **Verified:** README links use the exact committed names in the visually confirmed scenario order 01–05.
- **Not verified:** byte-for-byte equality with the old external attachment URLs, which were not directly retrievable.
- **Implementation preflight:** read #200's written requirements and **open all five repository PNGs individually**. The manifest, original URLs and filenames are not substitutes for examining the actual layouts.
- **Review/merge:** check the documentation diff and current-HEAD CI; only the PO decides whether to merge.

No production UI, backend, invitation API, security rules, tests or approved product requirements are changed by this archive or this documentation correction. Backend #187 is already complete. Functional implementation of #200 remains a **separately PO-authorized** task under [initiative #172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172).
