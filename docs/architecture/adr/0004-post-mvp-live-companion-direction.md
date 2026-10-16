# ADR 0004: Explore an online-first, single-device Commander companion after MVP

## Status

**Proposed for post-MVP exploration.** This ADR captures the architectural
direction discussed, not approval to implement the companion. The current
[MVP scope](../../product/mvp-scope.md) and accepted architecture remain
unchanged. The post-MVP UI strategy is already recorded in accepted
[ADR 0003](0003-defer-ui-framework-until-after-mvp.md), merged via
[PR #54](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/54).
This proposed companion direction leaves that decision unchanged.

## Context

The application currently records completed Commander games and intends to
provide basic player/deck statistics. A potential future live companion would
also record player-attributed life reductions and game duration while providing
a playful, mobile-friendly life tracker. This is an optional post-MVP feature,
not a reason to alter the current game-recording API or MVP architecture.

The primary risk for the companion's usefulness is interrupting game flow with
too much data entry; extra technical complexity should likewise be deferred
until justified.

## Proposed direction

1. **Optional companion:** keep ordinary completed-game entry. Tracked play is
   an optional alternate journey to the same completed game history.
2. **One device first:** one shared phone or tablet owns the live interaction
   during a game. Do not build multi-device synchronization initially.
3. **Online first:** rely on backend persistence for confirmed actions; do not
   design local offline queues, synchronization, or an offline-first database
   for the initial version. Clearly surface connectivity and unconfirmed saves.
4. **Separate in-progress from completed:** investigate a distinct live-session
   lifecycle that can finish into the existing game history. The current
   [games API](../../product/games-api.md) requires WIN/DRAW on creation and
   does not represent in-progress games. Do not silently count abandoned
   sessions as completed results.
5. **Capture only useful attributed actions:** life-total changes may be
   simple in the UI, with optional actor/target attribution and multi-target
   grouping so later statistics and undo are possible. Treat damage and other
   life loss as a combined tracked reduction initially; do not present it as
   rules-accurate damage or automatically infer Commander damage.
6. **Mobile web first:** explore using the existing React/TypeScript frontend
   with a touch-first layout, potentially installed as a PWA. Evaluate
   Capacitor/Android packaging only if an installable native app becomes
   useful. No framework or Android implementation is authorized here.

A more detailed but nonbinding interaction and product sketch lives in
[the companion concept](../../product/post-mvp-commander-companion.md).

## Alternatives considered

- **Synchronized personal devices:** offers more space per player, but
  requires live synchronization and additional failure handling.
- **Offline-first tracking:** could protect play from network outages, but adds
  storage, conflict resolution, and reconciliation complexity before the need
  has been demonstrated.
- **Extensive rules telemetry:** allows deeper analysis, but burdens players
  with frequent input and risks undermining the companion's purpose.
- **Immediate native Android rewrite:** duplicates or fragments the current
  React frontend without a demonstrated mobile-native requirement.

## Rationale

A single shared online device minimizes complexity while the interaction
design is still being validated. Keeping the live-session lifecycle distinct
protects the integrity of completed game history and avoids retrofitting
unfinalized results into the existing MVP API.

## Consequences and trade-offs

- Online play may be interrupted by connectivity loss; the first version may
  require reconnecting. Failed and ambiguous saves must not be misrepresented
  as committed actions.
- A separate live-session model, action persistence, undo semantics and an
  integration path to the existing game/deck lifecycle will need later design.
  This ADR selects no entity structure, endpoint, database schema or library.
- Tracking only recorded reductions produces partial, **not exhaustive** damage
  statistics; ordinary untracked games provide results but no event detail.
- The first visual prototype should test gesture comfort, animation timing,
  and usability before substantial backend work is authorized.
- Current MVP code, dependency choices, security boundaries and behavior remain
  unchanged. Specific authorization, session/CSRF and data-integrity concerns
  must be reviewed before implementation.

Revisit these proposed choices only after real usage feedback or newly defined
requirements justify additional complexity.
