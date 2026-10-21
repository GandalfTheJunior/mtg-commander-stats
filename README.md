# PR #96 screenshot evidence

Durable visual evidence published at the Product Owner's explicit request so
screenshots remain accessible on iPhone after the Codex task ends.

These are the original Chromium captures from the final production build of
application revision `4bab2db9e282e3a41ac8b655cbabcb0e3cef0c6a`.
All accounts, group names and invitation-code values are synthetic fixtures.
This branch stores review evidence only and is not intended to merge into main.
It does not change the application PR branch or its CI revision.

- [Mobile, 390px: both drafts after refresh](populated-drafts-390.png)
- [Desktop, 1280px: both drafts after refresh](populated-drafts-1280.png)
- [Narrow mobile, 320px: both drafts after refresh](populated-drafts-320.png)
- [Desktop empty list after retry: both drafts retained](empty-drafts-1280.png)
- [Mobile failed refresh: explicit retry](refresh-error-390.png)

`manifest.json` records original image SHA-256 hashes and the browser checks.
Physical iPhone Safari and live-backend end-to-end verification were unavailable.
