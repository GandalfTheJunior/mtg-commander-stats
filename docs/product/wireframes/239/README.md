# Approved mobile functional wireframe for #239

> **Archive incomplete — image binary pending.** This directory is a documentation-only staging point for the single PO-approved mobile v1 full-card viewer wireframe from [issue #239](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/239). It is **not yet a repository-local wireframe archive** and must not be treated as ready for implementation evidence or merge.

## Authoritative source

- **Owning specification:** [#239 — shared full-card viewer layout and interactions](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/239).
- **Approved mobile v1 source attachment:** [GitHub issue attachment](https://github.com/user-attachments/assets/f258135b-c41c-4bd9-bb64-60374d68908c).
- **Approval:** Product Owner approved the single mobile v1 wireframe on 2026-11-09, as recorded in #239.
- **Desktop:** no separate desktop wireframe is required; #239 specifies desktop behavior in text.
- **Authority:** the image governs layout hierarchy, grouping, control inventory and placement; #239's written contract governs dynamic states, accessibility, interaction, fallback behavior and exceptions.

## Required completion before review or merge

1. Download the **actual approved attachment** from #239. Commit that **image file** under this directory without recreating, approximating or restyling the design. Use its true file format and extension, and keep the approved visual content unchanged.
2. Add a relative Markdown link to the committed image here, recording its actual filename, format and pixel dimensions.
3. Open the committed image **visually**, compare its contents to the approved issue attachment, and document what was verified. Do not claim byte-for-byte provenance unless independently established.
4. Confirm that the PR includes only this documentation and the approved image binary. Complete independent review and verify required CI on the final HEAD before the Product Owner decides whether to merge.

**Blocked in the current editing environment:** the public GitHub `user-attachments/assets` binary could not be fetched through the available repository connector or file-download tools. Only its source URL and the written approval are verified; **no image has been uploaded or visually checked in this PR**.

## Implementation handoff after this archive is complete

For the separate, PO-authorized #239 implementation, read the full issue and open the committed image file itself. Reuse the existing `frontend/src/FullCardView.tsx` and saved snapshots from #222 for #195, #199 and #201. Do not add #235 token accordion behavior under #239; it remains an independent UI slice. This documentation PR does **not** authorize implementing #239 or merging this archive.
