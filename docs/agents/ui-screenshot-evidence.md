# Implementer screenshot and delivery contract

## UI screenshot evidence

For every implementation that changes a browser-visible UI (including layout,
styling, text, controls, navigation, or loading/error/empty states), provide
visual evidence in addition to the normal tests and checks. After the **last**
relevant UI edit, open the running application in a browser and capture at least
one screenshot showing the changed UI at a representative viewport. Cover each
materially different changed screen or state; if the change affects responsive
layout, include both desktop and mobile screenshots. Use non-sensitive
development/demo data, never real credentials or private user information.
Mockups, test snapshots, and screenshots from before the final edit do not count.

In the final Codex response to the PO, **include the actual screenshot(s)** as
viewable attachments or embedded images; if the client only supports artifacts,
link to verified, accessible image artifacts. A bare filesystem path, a claim
that a screenshot was taken, or a PR link without the image is not delivery.
A clickable absolute workspace-file link or embedded image can satisfy delivery
when the client supports access to that shared workspace. When a durable image
link is available, also provide it in the PR Reviewer Context. Do not commit
temporary screenshot files merely to satisfy this handoff rule.

### Client-aware delivery and recovery

Use the current client's supported link/attachment format. In the shared-workspace
client used for PR #126, the PO confirmed that direct absolute file links and
image embeds worked, while `sandbox:` links and tool image outputs did not.
For that client, use this Markdown shape with the **actual existing file path**:

```markdown
[Open desktop screenshot](/workspace/shared/downloads/task/desktop.png)
![Desktop screenshot](/workspace/shared/downloads/task/desktop.png)
```

The example path is illustrative: verify that the delivered file exists and is
readable. Do not assume this directory, URI scheme, or rendering behavior applies
to every client, and do not require a separate upload tool when a supported
workspace link already provides access.

Keep capture, agent inspection, and PO receipt distinct. A successful image-view
tool call proves neither client rendering nor PO receipt. Report only the state
supported by evidence; record explicit PO receipt confirmation when provided.
This adds no mandatory confirmation question or approval gate to every task;
receipt also does not imply UI approval or permission to merge.

If the PO reports missing images, check the file and link format, then use another
supported delivery route instead of repeating the failed route. A failed link or
missing upload tool alone does not establish that the client cannot display
screenshots. Correct unsupported delivery claims in the response and PR. Once
receipt is confirmed, remove any stale delivery blocker from the PR while
retaining real limitations such as session-local rather than durable hosting.

If the application, browser, capture tool, or image delivery is unavailable,
state exactly what is blocked in the final response and PR, without inventing
images or describing the screenshot requirement as satisfied. The implementation
is **not fully visually verified** until the PO receives the required evidence.
Backend-only or otherwise non-visual changes do not trigger this requirement.

