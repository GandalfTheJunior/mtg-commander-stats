# Post-MVP concept: Commander live companion

## Status and scope

Exploratory product concept, **not** an MVP commitment, implementation-ready
specification, or issue. The existing [MVP scope](mvp-scope.md) remains
authoritative. This document captures the direction discussed for a potential
future extension so it can be refined before any implementation is approved.
The architectural direction is recorded separately in
[ADR 0004](../architecture/adr/0004-post-mvp-live-companion-direction.md).

## Product goal

Make a shared Commander game tracker feel like a tactile, enjoyable companion
rather than a form that interrupts play. Prioritize fast, intuitive touch
interactions and satisfying feedback over exhaustive game telemetry. The
longer-term benefit is opt-in, granular player/deck statistics.

## Optional ways to record a game

- **Standard recording:** play without the companion and record the result as
  supported by the normal game-recording flow. Companion participation is not
  required to contribute basic game results to statistics.
- **Live companion:** select a play group, participants and each participant's
  deck; start a tracked session; interact with the tracker throughout the game;
  then end the session and record a winner or draw. Recorded actions can enrich
  statistics for those players and decks. Unfinished or abandoned sessions
  should not be silently counted as completed games.

## Initial companion experience to explore

- **One shared device:** start with a phone or tablet passed around or placed on
  the table. No synchronized per-player devices are planned for the first
  version.
- **Life totals and attributed changes:** show player avatars and life totals.
  Drag an acting player's avatar onto a target, enter an amount, and confirm a
  life reduction attributed to that player. Initially, damage and other life
  loss can share the same quick interaction and a combined *tracked reduction*
  statistic, rather than demanding detailed rules categorization.
- **Multiple targets:** provide an \"all opponents\" toggle so a single input can
  apply the same amount to all other players. The resulting changes should form
  one undoable action.
- **Unattributed adjustments:** provide fast plus/minus life-total controls for
  gain, correction, and other changes without a known source. Do not misleadingly
  attribute these changes to an attacking player.
- **Duration:** record session start and finish timestamps to determine elapsed
  time without separate tracking chores. Pausing or tracking turns is not part
  of this initial concept.
- **Recover from mistakes:** provide an obvious undo mechanism, including for
  multi-target actions, and make failed or unconfirmed saves visible.
- **Playful interaction:** drag feedback, avatar movement toward the target,
  brief impact effects, visible life-total updates, sounds and potentially
  haptics. Effects should feel responsive, not delay play; allow muting sounds
  and respecting reduced-motion preferences.

The first interaction prototype should focus on **one source to one target**
and **one source to all opponents**. Validate touch ergonomics on real phones
before designing the full game flow.

## Statistics and interpretation

The resulting data could answer questions such as \"how many life points did
Bob cause Petra to lose in games where both participated?\" and compare that
by player, deck, play group, or match. Only attribute a change when its source
was actually entered. Because the initial interaction combines damage and life
loss, do **not** advertise those sums as rules-accurate damage statistics.
Separate damage type or Commander combat damage would require an explicit
later design decision; Commander damage cannot simply be inferred from life
loss. Ordinary result-only games cannot supply action-level statistics.

Avoid routine logging of spells, individual card abilities, turn phases,
combat details, and every rules event. Those would work against the intended
ease of use.

## Technology direction (not yet selected for implementation)

Keep the existing React/TypeScript web frontend and Spring Boot/PostgreSQL
backend as the starting point. Explore a mobile-first web experience and an
installable PWA first; Capacitor packaging as an Android app is an optional
later path, not an agreed shipping requirement. Smooth animations and gestures
can use an established React motion/gesture library after a prototype comparison;
no library is committed by this concept.

Assume a network connection for the first version; no offline database,
offline queue or multi-device synchronization is planned. An action must not
appear confirmed as stored until the server acknowledges it. A disconnected
session may require reconnecting before further authoritative changes.

## Boundaries and questions for later refinement

- The [existing games API](games-api.md) records *completed* games with a WIN or
  DRAW result; it does not create ongoing sessions. Decide how a live session
  begins, persists and finalizes into the current historical game model without
  counting incomplete games or bypassing deck usage/archival rules.
- Decide which recorded actions need durable source/target attribution, how undo
  or corrections work, and how retries avoid double-applying a change.
- Determine whether a first version needs a **Commander combat damage** mode.
  Commander damage is rules-distinct from generic life loss and may require
  per-commander tracking; no support is promised by the simple combined metric.
- Decide how elimination, draw, changing participants, erroneous session
  termination, and loss of network connectivity should be handled.
- Validate a feasible visual layout on various phone sizes, accessibility,
  reduced-motion behavior, sound defaults, and interaction speed.
- Review cookie/CSRF/session behavior and deployment requirements before
  selecting PWA installation or an Android wrapper.

All of the above requires separate scoping, acceptance criteria, and PO approval
before development. This concept must not be treated as a reason to expand the
current MVP or install dependencies now.
