# Play-group seasons and win-rate leaderboards (post-MVP concept)

**Status:** Agreed product direction; implementation deferred until separately approved.
**Scope:** Individual play groups. This document is the authoritative product concept, not an API contract or ADR.
**MVP boundary:** The [MVP scope](mvp-scope.md) includes basic group player/deck statistics but explicitly excludes placements and rankings. This concept does not expand that milestone.

## Purpose

Play groups previously tracked competitive seasons in a shared spreadsheet. Each group should be able to define its own season periods, distinguish competitive season games from casual games, and compare player/deck results for a chosen season without losing all-time history.

## Agreed behavior

### Seasons belong to a play group

- A season has a **name**, **start date**, and **end date**. Seasons are configured per play group, not globally.
- The **group OWNER** can create seasons and configure their optional qualifying minimum.
- The date range must be valid (start on or before end); seasons within the same group must **not overlap**.
- Finished seasons remain accessible; beginning a new season does not reset or delete prior games or statistics.
- A group may also have periods with no season.

### Games explicitly count toward a season, or not

- When recording a game, the user deliberately chooses between **Season game** (with the relevant season identified) and **Casual game / Not counted toward a season**.
- A casual game is allowed even while a season is running. The calendar period alone **never silently enrolls** a game in a season.
- Each game belongs to **at most one** season, and only one in its own play group.
- Every game, seasonal or casual, contributes to the relevant **all-time statistics for that group**. Only games explicitly assigned to a season contribute to that season's figures and ranking.
- The same distinction must be available when games are created using the later **live Companion**. Multi-device real-time play is not part of this requirement.

### Season statistics and ranking

- In the group's statistics area, users can switch between **all time**, a **current season**, and **past seasons**.
- The season leaderboard ranks players by **win rate: wins divided by games played in that season**, not a separate points system. Always show the number of games and wins beside the percentage.
- Season-filtered statistics are available for each group member and their decks. A member's deck statistics should help explain their aggregate win rate. These statistics remain **group-specific**; they are not blended across play groups.
- A season has an **optional minimum number of season games per player** to qualify for an official ranking position. If omitted, no minimum is imposed.
- Players below the configured minimum can still view their season games, wins, and win rate, and see how many more games they need to qualify; they are clearly separated from officially ranked players.
- The minimum changes **ranking eligibility only**. It neither prevents recording games nor removes those games from statistics.
- There is **no maximum game count, no target number of games, and no points system**.

## Suggested mobile-first interaction

- Play group → **Statistics** → select **All time / Current season / Past season** → **Leaderboard** → member → deck.
- Play group → season management (OWNER): season name, start/end dates, optional switch **Minimum games to qualify** and a positive integer field when enabled.
- New game → after choosing participating members/decks: a clear **Season game / Casual game** selection, displaying the season's name if applicable. Avoid relying on a date-based auto-selection as the sole interaction.
- Qualifying and non-qualifying players should remain discoverable; do not hide their history.

## Dependency: actual game date

The existing [games API](games-api.md) records `recordedAt`, i.e. when the entry was created, rather than the date the match was actually played. A match can be entered later. Season support therefore needs an explicit **played-at date** (and a documented date/time-zone policy), distinct from the immutable recording timestamp, so delayed entries can be assigned correctly. This is a dependency for later design/implementation, **not** a request to change the MVP game contract now.

## Remaining decisions before implementation

The product discussion has **not** yet settled:

1. Season editing, cancellation/deletion, and whether completed seasons are locked.
2. Assignment/editing rules when a game is dated outside a season, or the season dates are changed later; timezone and date-boundary semantics.
3. Whether and how past games are assigned retroactively to newly created seasons.
4. How tied win rates are presented or co-winners determined, and how players with no games appear.
5. Details of draw handling in leaderboard presentation (the MVP records draws with no winner); validate the final denominator/tie policy against existing basic statistics.
6. Default selection of Season game versus Casual game, including how to handle no active season.

Resolve these explicitly during refinement; do not infer hidden game classification from timestamps or silently invent additional season rules.

## Acceptance scenarios for later issue breakdown

- A group OWNER can define a valid season with or without an optional minimum; an overlapping season in the same group cannot be created.
- A game inside an active season can be recorded as **casual** and affects all-time but not season statistics.
- A game explicitly assigned to a season affects that season and all-time numbers, with member and deck breakdowns.
- A delayed game entry is evaluated against its **actual play date**, not only `recordedAt`; the permitted assignment behavior is specified before coding.
- A group with a minimum of 10 games shows a player with 8 games and their win rate, while clearly indicating **2 games remaining** to qualify for placement.
- Past seasons and casual games remain accessible after a new season begins. Group statistics never mix different play groups.

## Non-goals / delivery

No MVP scope expansion, automatic match invitations, multi-device synchronization, maximum game quota, target count, bonus scoring, or implementation in this documentation change. Before implementation, refine the remaining decisions and split the feature into reviewable backend/API, frontend, and statistics work as needed.
