# MTG Commander Stats

A Commander statistics application and a learning project for AI-assisted
software engineering. This bootstrap provides development infrastructure and
application skeletons; accounts, decks, groups, games, and statistics are not
implemented yet.

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

It listens on port 8080. Spring Security's default login page and generated
in-memory development user remain enabled; these are not an implemented MVP
login flow. There are no product API endpoints. Flyway is enabled without
business migrations, and Hibernate validates rather than creates tables.

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
- [Reviewing principles](docs/development/reviewing.md)
- [Agent working rules](AGENTS.md)
