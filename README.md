# MTG Commander Stats

A Commander statistics application and a learning project for AI-assisted
software engineering. The backend supports user registration and session
authentication. Profiles, decks, groups, games, and statistics remain planned.

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

For a same-origin SPA, browser `fetch` retains cookies by default. The current
frontend on port 5173 does not call the backend; a future frontend integration
will need a same-origin development proxy or an explicit cross-origin setup.
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

Open the local URL printed by Vite (normally http://localhost:5173). The root
currently identifies the project and does not call the backend.

Stop the applications with Ctrl+C and PostgreSQL with `docker compose stop`.
The named volume preserves local data.

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

Tests terminate without watch mode. GitHub Actions runs separate `backend` and
`frontend` jobs for PRs to `main` and pushes to `main`.

## Project documentation

- [MVP scope](docs/product/mvp-scope.md)
- [Architecture and ADRs](docs/architecture/overview.md)
- [Development workflow](docs/development/workflow.md)
- [Java coding conventions](docs/development/java-conventions.md)
- [Testing and verification](docs/development/testing.md)
- [Reviewing principles](docs/development/reviewing.md)
- [Agent bootstrap](AGENTS.md) and [role registry](docs/agents/README.md)
