# Cozy Commander motion playground

A disposable design/interaction experiment for #135. This is **not** the production
UI contract: `docs/product/frontend-redesign.md` still excludes ornamental motion.
Production adoption requires a separate PO decision/specification. No GameEditor,
game details, routes, APIs, persistence, remote artwork or real players are used.

## Open locally

```sh
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173/dev/lounge.html** (or the equivalent private forwarded
Vite URL). No backend/login is needed. The ordinary `index.html` production build
has no import of this entry; Vite does not emit this HTML or its code. The existing
`/dev/theme.html` fixture remains separate. Do not add either fixture to Rollup inputs.

## Implementation notes

- No new dependencies. MUI supplies controls and the existing theme; all exploratory
  CSS is imported only by the standalone entry.
- Pointer capture is confined to the grip (`touch-action: none`). Outside the grip,
  normal touch scrolling remains available. The whole-card overlay uses measured
  dimensions. ResizeObserver measures each card; compacted-list midpoint thresholds
  determine insertion. CSS transforms preview the new arrangement before release;
  committed state changes only on valid drop. DOM order matches the committed order.
- Resize, scroll, lost capture, Escape, blur, hidden page and pointer cancellation
  retire the drag. There is no auto-scroll during dragging; scroll first or use the
  up/down controls for long phone lists. Those controls provide insertion semantics
  and an aria-live announcement while preserving focus on the moved control.
- Six decorative points (three visible on phones) follow bounded rounded-rectangle
  trajectories along the window's live dimensions. Flight and brightness have
  independent random destinations/durations, smooth acceleration/deceleration and
  occasional near-pauses/full fades. The frame rails keep points away from text.
  A single requestAnimationFrame loop writes only transforms/opacity; no particle
  library, viewport blur, state update per frame, or network work. ResizeObserver,
  animation frame and listeners are cleaned up; hidden tabs pause the loop and CSS
  firelight. Reduced motion removes fireflies and freezes light regardless of intensity.
- Firelight uses a cheap, slow layered-gradient transform/opacity cycle. The 19-second
  cycle has uneven brightness landmarks; it is intentionally bounded rather than a
  physical lighting simulation. Strong intensity is a comparison aid.
- Button compression uses native `:active` with a short release; keyboard activation
  additionally exposes persistent selection/status text. Disabled, focus and selected
  states remain distinguishable when motion is off.

## Reviewer manual checklist

- Desktop: drag Mira past multiple unequal-height cards. **Before releasing**, check
  that the intervening cards move and a full-size dashed insertion slot opens. Drop
  at both ends; verify insertion rather than swapping. Repeat with the tallest card.
- Cancel using Escape, release outside the list, resize, scroll and change tabs. No
  stranded overlay; committed order remains intact. Repeat a valid drag afterward.
- Tab to up/down controls; activate with Space/Enter. Verify position announcement,
  focus continuity and disabled boundaries. Confirm selection, start multiple demo
  rounds rapidly, then reset. No request or saved-game claim should appear.
- At 320/375/390px: no horizontal overflow, all controls reachable. On a **real phone**,
  drag from the grip, scroll from card text and outside cards, cancel via browser/OS
  interruptions, rotate, and use up/down for moves beyond the visible viewport.
- Watch the frame for at least 30 seconds: independent, gently curved flight, slower
  segments, different fade/hold/dark phases, no paths crossing primary content. Resize
  and check that fireflies remain anchored. Compare Dezent/Deutlich and both off toggles.
- Enable OS reduced motion (also while the page is open). No decorative flight/flicker;
  static light, instant reorder, functional actions. The strong setting cannot override it.
- Hide/reopen the tab and navigate away/back; no continuing frame work or duplicate
  loops. Check the existing theme fixture and the ordinary production build separately.

Automated component tests cover insertion, pre-drop displacement with unequal heights,
valid drop, cancellation, alternative controls, announcements, demo controls, OS motion
and animation retirement. Browser screenshots supplement these; physical-device touch,
screen-reader speech and subjective animation quality still need human review.
