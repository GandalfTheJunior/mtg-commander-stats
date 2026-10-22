# MTG Commander Stats

A Commander statistics application and a learning project for AI-assisted
software engineering. The application supports user registration, session
authentication, authenticated deck management, and browser play-group management
with join-code membership. The browser records Commander games, shows group history, and handles permanent
deck usage and explicit archival through the backend API. Opened groups show
basic player and deck [statistics](docs/product/statistics-api.md). Profiles remain
planned.

## Agent entry point

Agent clients and repository harnesses must load the root [`/AGENTS.md`](AGENTS.md)
before substantive repository work. This is the generic bootstrap entry point;
`AGENTS.md` selects and loads the role contract that matches the requested outcome.
Configure the repository root as the task workspace when the client discovers
instruction files automatically, or load `/AGENTS.md` explicitly when it does not.

## Stack and prerequisites

- Java 25 JDK (`JAVA_HOME`), Spring Boot 4.1.1, and Maven 3.9.11 via the included Wrapper
- Node 24 LTS and npm; React, TypeScript, Vite, ESLint, Vitest, and React Testing Library
- Docker with a running Linux container engine and Docker Compose v2 or newer
- PostgreSQL 18, supplied by Compose locally and Testcontainers in backend tests

No global Maven installation is needed. The first builds need internet access
for dependencies and container images. Use Git Bash on Windows for the Bash
commands below, or PowerShell 7 with `./mvnw.cmd` instead of `./mvnw`.

## Local development

From the repository root, choose a local database password in your shell:

```bash
read -r -s -p 'Local PostgreSQL password: ' POSTGRES_PASSWORD
printf '\n'
export POSTGRES_PASSWORD
docker compose up -d --wait
```

In PowerShell 7, use `$env:POSTGRES_PASSWORD = Read-Host 'Local PostgreSQL password' -MaskInput`
before running the same Compose command.

The database binds to `127.0.0.1:5432`. Optional environment variables are
`POSTGRES_PORT`, `POSTGRES_DB`, and `POSTGRES_USER`; defaults are listed in
`.env.example`. Compose can also read a root `.env` copied from that example
with a locally chosen password. **The backend does not automatically read
Compose's `.env`: export the same values in the backend shell.** Never commit
local credentials. An existing database volume retains its original credentials;
changing an environment variable does not change an initialized database password.

Start the backend from a shell with those variables set:

```bash
cd backend
./mvnw spring-boot:run
```

It listens on port 8080. Anonymous `POST /api/users` accepts JSON such as
`{"email":"gandalf@example.com","username":"Gandalf","password":"exact supplied password"}`.
Successful registration returns `201` with the stable `id` (UUID) and display
`username`; invalid input returns `400`, and duplicate case-insensitive email
identities return `409`. Email and credentials are never returned. See the
[registration rules](docs/product/mvp-scope.md#user-identity-and-registration).

Only the exact registration POST is exempt from CSRF. Login and logout require
CSRF protection; registration does not automatically log the user in. The browser
API flow is:

1. `GET /api/csrf` returns `{"headerName":"X-CSRF-TOKEN","token":"..."}`.
   Keep the session cookie from this response.
2. `POST /api/session` with JSON `{"email":"gandalf@example.com","password":"exact supplied password"}`,
   the session cookie, and the returned token in the `X-CSRF-TOKEN` header.
   Success returns `200` with `{"id":"<uuid>","username":"Gandalf"}` and rotates
   the session cookie. Invalid credentials return a generic `401`.
3. Fetch `GET /api/csrf` again with the updated cookie: login invalidates the old
   token. Use the new token for subsequent unsafe requests.
4. `GET /api/me` with the cookie returns the current identity, including after a
   page reload. It returns `401` when the session is missing or expired.
5. `DELETE /api/session` with the cookie and current CSRF token returns `204`
   and invalidates the session. Bootstrap again before another login.

For the same-origin SPA, browser `fetch` retains cookies by default. During local
development, Vite proxies `/api/*` from port 5173 to the backend on port 8080, so
registration and session authentication work without separate CORS configuration.
The token is read from the JSON response, not from the HttpOnly session cookie.
Missing/invalid CSRF protection returns `403`; protected anonymous requests return
`401` without redirects. Other authenticated access denials return `403`.
Flyway creates the `users` table; Hibernate validates rather than creates tables.
The email migration cannot safely infer addresses for users created by older
versions. If a local development database contains pre-email users, reset and
recreate its volume before starting this version; the migration fails instead of
inventing email values or deleting users.

In another terminal, start the frontend:

```bash
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). The page
supports account registration and separate login, displays the authenticated
username from `GET /api/me`, and restores that session after a reload. An
authenticated user lands on **Dashboard**, a concise welcome/wayfinding screen.
The **Dashboard / Playgroups / Decks** navigation uses `/dashboard`, `/playgroups`
and `/decks`, with a fixed bottom bar on phones and a top bar on wider screens.
The current account and **Log out** are at the top right. A signed-out direct
visit to one of those three URLs resumes that destination after verified login;
generic sign-in opens Dashboard. Supported group tabs, OWNER invitation-code and
deck-editor and Spieldetails URLs also resume after verification; unsupported paths return safely to Dashboard.
See [browser routing](docs/development/frontend-routing.md) for session lifecycle
and SPA fallback requirements.

In **Decks**, an authenticated user can list, create, edit, and delete their own
manually entered decks in the **My decks** area. Deck changes use the existing CSRF/session flow,
persist in PostgreSQL, and remain scoped to the authenticated user's stable UUID.
Deleting an unused deck asks for confirmation naming that deck; canceling sends
no deletion request. Once a deck is used in a committed game, its commander and
colors are permanently locked; its name remains editable. This restriction stays
after its last game is changed or deleted. Used decks have an explicit **Archive**
action with a separate confirmation. Archived decks remain visible in My decks
and historical games, but cannot be selected for new games. There is no unarchive
action. **Refresh decks** reloads current server state after conflicts or errors. Signed-in users can **Log out**; login and registration
forms are shown again after logout. Protected deck/group content and invitation
codes are hidden during logout. Failed attempts recheck the session and offer
retry; an unavailable identity check keeps protected content hidden.

In **Playgroups**, use **Gruppe erstellen** or **Gruppe beitreten** to create a named group
or join/rejoin using a current invitation code. All memberships appear in API order
as themed cards with **Gruppenersteller/Mitglied** roles. Identical group names show
short distinguishing ID prefixes. Open a group from Dashboard or Playgroups to enter **Spiele**, with
**Spiele / Statistiken / Mitglieder** tabs at `/playgroups/:groupId`. **Mitglieder**
shows active members, German roles and **Du**; short stable ID suffixes distinguish
duplicate display names only. **Mitglieder aktualisieren** reloads current membership; **Playgroups aktualisieren** retries or reloads your active memberships.
Memberships persist after a page reload and session restoration.

An OWNER opens **Einladungscode verwalten** from **Gruppenaktionen**. Its dedicated
screen fetches no code until **Einladungscode anzeigen** is selected. Code
regeneration requires confirmation that the old code becomes invalid immediately
and existing members remain. Failed or uncertain regeneration clears the old
code; explicitly show it again to inspect the current server value. If clipboard access fails, copy the visible
code manually. A MEMBER uses **Gruppenaktionen → Gruppe verlassen** after confirming loss of active access;
historical membership/results remain associated with the user. Rejoin using a
current code. Owners cannot leave. An expired session clears protected browser
content and asks the user to sign in again.

Inside the group's **Spiele** tab, **Spiel erfassen** opens a focused editor with
four empty player/deck cards. Select 2–6 different active members and an eligible
owned deck for each. Untouched blank cards are omitted; partial cards must be
completed or cleared. Completed cards collapse to readable summaries and reopen
with **Bearbeiten**. Used, unarchived decks remain eligible; you need not
participate. Select **Sieg** and an explicit participating winner, or
**Unentschieden** with no winner, then **Spiel speichern**. Deck selection failures
have an explicit retry; empty lists require a different player or a new
unarchived deck. Peer decks remain read-only. Group tabs and same-group browser
Back/Forward preserve the full draft without warning; changed drafts prompt
before cancellation, leaving the group or refreshing data. See the
[game-editor guide](docs/development/frontend-routing.md#focused-commander-game-editor).

History cards follow server order and show winner plus winning deck or
**Unentschieden**, participant count and **Erfasst am**. Each card opens
`/playgroups/:groupId/games/:gameId` with freshly authorized **Spieldetails**.
**Zurück zu Spiele** always returns to the group's current history. Details show
all assignments, commander, color identity, archived decks, former members and
the original creator, using current public names and stable IDs where needed.

Only the active original creator or group OWNER sees **Bearbeiten** and **Löschen**
in **Spielaktionen**. Bearbeiten returns to Spiele, freshly verifies the target
and prefills the existing editor. Unchanged historical participant/deck pairs can
remain when members have left or decks are archived. Cancel sends no write.
An active form prevents opening a competing detail view. Lösch confirmation names
the game and explains permanence and retained deck usage; cancel/Escape sends no
DELETE. Only acknowledged 204 produces success. Ambiguous deletion safely reads
current group/game state without repeating the write or claiming success.
See [routing and state lifetimes](docs/development/frontend-routing.md#game-history-and-spieldetails).

**Refresh games** verifies current group access and reloads history. Failed or
ambiguous game operations hide retired game data and recheck group details; a
confirmed membership permits an explicit refresh before retrying. A 400 validation
rejection keeps the editable draft for correction. Review the
refreshed history after a network failure because the server may have committed
the request. A 403 alone does not assert logout or departure. Switching/closing a
group, refreshing members, logging out, or changing identity retires old game
requests and drafts. Game mutations reload your deck lifecycle state; deck
mutations reload the selected game's history/selection area.

The **Statistiken** tab opens on **Spieler** and switches to **Decks** without
changing the URL. Phones show one card per API row; at the shared MUI `md`
breakpoint (900px), only the selected dataset appears as a sortable table.
Players show Spiele, Siege and Siegrate; decks also show commander, owner and
**Archiviert**. Only recorded players/decks appear, including former members and
archived decks. **Kennung anzeigen / Kennung verbergen** reveals full player or
deck identifiers (plus deck owner ID) on request to distinguish identical names.
Percentages come directly from the backend, with at most two decimal places.

Initially, **Standardreihenfolge** retains the received API order: players by
username/user ID, decks by owner/deck name/deck ID. Mobile **Sortieren nach** and
the separate **Aufsteigend / Absteigend** button offer every existing sort field.
Desktop column buttons expose their active direction; **Standardreihenfolge**
resets sorting. Numeric columns start descending, text columns ascending; repeated
header activation reverses direction. Case-insensitive, accent-sensitive text
comparison and stable ties preserve the existing contract. Each dataset retains
its own temporary sort and the chosen subview survives same-group tab changes,
refresh and acknowledged game writes. No ranking is implied.

**Statistiken aktualisieren** reloads figures and immediately hides old rows.
Acknowledged game creation, editing and deletion also reload them; **Refresh games**,
**Mitglieder aktualisieren** and reopening a visited group retain their existing
refresh behavior. Each subview has its own empty feedback; the switch remains
available. Loading and failed refreshes hide previous rows, with explicit retry.
Statistics denials use the same safe group recheck as games. Confirmed access
offers **Statistiken aktualisieren** without an automatic retry loop; unresolved
checks keep protected data hidden. Closing/switching groups, logout and session
changes retire requests, rows, chosen subview and sorts. No presentation choice
is persisted to browser storage or the API.

The browser uses the existing session/CSRF flow and documented
[play groups](docs/product/groups-api.md), [Commander games](docs/product/games-api.md),
[deck lifecycle](docs/product/decks-api.md), and
[group statistics](docs/product/statistics-api.md) APIs.

Stop the applications with Ctrl+C and PostgreSQL with `docker compose stop`.
The named volume preserves local data.

## Populated local demo

For an isolated PostgreSQL demo with six fictional accounts and 36 reproducible
Commander games, follow the [demo setup](docs/development/demo.md). It includes
PowerShell commands, locally generated credentials, expected player/deck results,
and an explicit demo-only reset. The regular development database is untouched.

Deck creation and management use `/decks/new` and `/decks/:deckId/edit`.
Dashboard and Decks actions return to their calling overview after a confirmed
write or explicit cancel/discard. Direct links/reloads return to Decks. See the
[routing and draft-safety guide](docs/development/frontend-routing.md#focused-deck-editor-and-return-context).

## Verification

From `backend/`:

```bash
./mvnw verify
```

This is the canonical backend check. It runs the real Spring context against
an isolated PostgreSQL 18 Testcontainer, including datasource, JPA, and Flyway.
Docker must be available; tests do not skip when Docker is missing. Compose
need not be running, and no local database password is needed for the test.

From `frontend/`:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

From the repository root, verify the demo tooling with `node --test tools/demo/*.test.mjs`.
See [demo verification](docs/development/demo.md#verification) for the opt-in real API check.

Tests terminate without watch mode. GitHub Actions runs separate `backend` and
`frontend` jobs for PRs to `main` and pushes to `main`.

## Project documentation

- [MVP scope](docs/product/mvp-scope.md)
- [Post-MVP frontend redesign concept](docs/product/frontend-redesign.md)
- [Post-MVP Commander companion concept](docs/product/post-mvp-commander-companion.md)
- [Play groups API](docs/product/groups-api.md)
- [Commander games API](docs/product/games-api.md)
- [Group statistics API](docs/product/statistics-api.md)
- [Deck lifecycle API](docs/product/decks-api.md)
- [Scryfall card lookup API](docs/product/scryfall-api.md)
- [Architecture and ADRs](docs/architecture/overview.md)
- [Post-MVP frontend UI strategy (ADR 0003)](docs/architecture/adr/0003-defer-ui-framework-until-after-mvp.md)
- [Frontend theme and incremental adoption](docs/development/frontend-theme.md)
- [Browser routing and authenticated shell](docs/development/frontend-routing.md)
- [Proposed live companion direction (ADR 0004)](docs/architecture/adr/0004-post-mvp-live-companion-direction.md)
- [Development workflow](docs/development/workflow.md)
- [Java coding conventions](docs/development/java-conventions.md)
- [Testing and verification](docs/development/testing.md)
- [Reviewing principles](docs/development/reviewing.md)
- [Agent bootstrap](AGENTS.md) and [role registry](docs/agents/README.md)
- [Agent harness verification scenarios](docs/agents/harness-verification.md)
