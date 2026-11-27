# MTG Commander Stats

[![CI](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/workflows/ci.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Java 25](https://img.shields.io/badge/Java-25-ED8B00?logo=openjdk&logoColor=white)
![Spring Boot 4](https://img.shields.io/badge/Spring_Boot-4-6DB33F?logo=springboot&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![PostgreSQL 18](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)

A companion app for Magic: The Gathering Commander playgroups: record your games, manage your decks and explore player and deck statistics.

## Design prototypes from the motion playground, planned for the app's upcoming redesign

https://github.com/user-attachments/assets/3f867806-1616-475e-98d8-2bf926b59894

*UI showcase of Player Card Elements*

https://github.com/user-attachments/assets/b35d5848-ead3-4373-bda6-f908810b68f0

*UI Showcase of the winrate per color statistics*

## About

The idea for this application came from my own MTG Commander playgroup. We used to keep track of our games in an Excel spreadsheet, which worked, but became tedious over time.

I wanted to turn this process into something more enjoyable. Instead of just collecting numbers, the goal is to create a fun and engaging companion for Commander nights, with a warm and cozy design, intuitive interactions, and interesting statistics brought to life through visualizations.

The application already supports creating and joining playgroups, managing Commander decks, recording games, and viewing player and deck statistics. In the future, I want to expand on these features and make exploring your playgroup's history even more interesting.

## Why AI-assisted development?

On a personal level, this project is also my way of exploring the changing landscape of software development.

Having worked as a Java backend developer, I was initially quite skeptical about using AI for software development. However, the more I experimented with coding agents, the more potential I began to see in this technology.

Rather than simply prompting AI to build an application, I wanted to explore how agents could be integrated into a structured software development process.

Together with AI agents, I designed the application's architecture and developed a workflow built around clearly defined responsibilities, requirements, automated testing, and review processes.

The application code is written by AI agents, while I focus on product decisions, architectural direction, and continuously improving the development workflow.

This project is an ongoing experiment in understanding both the possibilities and limitations of agent-based software development.

## Features

The App has a fully functional UI, a visual redesign is in progress.

### Accounts

You can create an Account and Log in.

### Decks 

Create a Deck simply and fast by only entering its name and commander. 
Cards are searched with scryfall-API. 
Optional manabox-links can be added as there is no real deck editor yet.
Full support for PEDH, partner commanders and companions.
Click on an artwork to view the full Card, text and tokens.

### Playgroups

You can create or join playgroups. invites work through sharing links or a QR-Code.
Record matches between members of your playgroup for 2+ players.
Gather data about players, decks, starting order, color-identity and placements.

### Quick Profiles

Only one user needs to have a registered account. For everyone else you can just add a quick profile.
You can do so even from the record game dialog. Just click "Register Quick Profile" and create a deck.
You can rename a quick profile to keep track of who is who.
Join quick profiles with a real account by simply choosing the "Merge Accounts" option. This is as easy
as sharing a link or scanning a QR-Code.


## Screenshots

### Current UI (Built for Functionality)

<img width="200" alt="IMG_2505" src="https://github.com/user-attachments/assets/da6a543c-ed00-4757-ae16-21e46fd4212e" />
<img width="200" alt="IMG_2504" src="https://github.com/user-attachments/assets/62c6887c-4620-4f19-8742-a52ffec01619" />
<img width="200" alt="IMG_2503" src="https://github.com/user-attachments/assets/0f34f74a-c475-4c40-a470-25ec0a6a4832" />
<img width="200" alt="IMG_2506" src="https://github.com/user-attachments/assets/63058764-5b62-46d2-a6cc-754c72dd32b4" />
<img width="200" alt="IMG_2507" src="https://github.com/user-attachments/assets/6cc14f66-2192-4b16-8a5e-b7681a34d06e" />


### Experimental Design Elements (WIP)

<img width="200" alt="IMG_2510" src="https://github.com/user-attachments/assets/5185b4ab-7182-4b4c-8078-3cfda51e50f6" />
<img width="200" alt="IMG_2509" src="https://github.com/user-attachments/assets/04a9fdf1-02cf-4fb0-8e90-db4ae82a96ed" />
<img width="200" alt="IMG_2508" src="https://github.com/user-attachments/assets/c2d066db-f564-4579-9e51-aa4780fc4ad7" />

## Stack and prerequisites

- Java 25 JDK (`JAVA_HOME`), Spring Boot 4.1.1, and Maven 3.9.11 via the included Wrapper
- Node 24 LTS and npm; React, TypeScript, Vite, ESLint, Vitest, and React Testing Library
- Docker with a running Linux container engine and Docker Compose v2 or newer
- PostgreSQL 18, supplied by Compose locally and Testcontainers in backend tests

## Getting started

With the prerequisites installed, start PostgreSQL and the backend from the
repository root:

```bash
read -r -s -p 'Local PostgreSQL password: ' POSTGRES_PASSWORD; printf '\n'
export POSTGRES_PASSWORD
docker compose up -d --wait
cd backend && ./mvnw spring-boot:run
```

In a second terminal, start the frontend and open http://localhost:5173:

```bash
cd frontend && npm ci && npm run dev
```

See [Local development and verification](docs/development/local-development.md)
for zsh and PowerShell variants, environment variables, the browser and API
walkthrough, a [populated demo database](docs/development/local-development.md#populated-local-demo)
and the full [verification commands](docs/development/local-development.md#verification).

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
- [Storybook component workshop](docs/development/storybook.md)
- [Browser routing and authenticated shell](docs/development/frontend-routing.md)
- [Proposed live companion direction (ADR 0004)](docs/architecture/adr/0004-post-mvp-live-companion-direction.md)
- [Local development and verification](docs/development/local-development.md)
- [Development workflow](docs/development/workflow.md)
- [Java coding conventions](docs/development/java-conventions.md)
- [iPhone preview via GitHub Codespaces](docs/development/codespaces.md)
- [Testing and verification](docs/development/testing.md)
- [Codex Cloud and Claude Code Cloud environments](docs/development/agent-cloud-environments.md)
- [Reviewing principles](docs/development/reviewing.md)
- [Agent bootstrap](AGENTS.md) and [role registry](docs/agents/README.md)
- [Agent harness verification scenarios](docs/agents/harness-verification.md)

### Motion playground (development only)

For the isolated Cozy Commander experiment, open `/dev/lounge.html` with the frontend
Vite dev server. See [run instructions and review checklist](docs/development/motion-playground.md).

## Agent entry point

Agent clients and repository harnesses must load the root [`/AGENTS.md`](AGENTS.md)
before substantive repository work. This is the generic bootstrap entry point;
`AGENTS.md` selects and loads the role contract that matches the requested outcome.
Configure the repository root as the task workspace when the client discovers
instruction files automatically, or load `/AGENTS.md` explicitly when it does not.
For Claude Code, the root [`CLAUDE.md`](CLAUDE.md) is a compatibility shim that
only imports `AGENTS.md`. Current Claude Code versions can read `AGENTS.md`
directly when no `CLAUDE.md` or `CLAUDE.local.md` applies, but older versions,
a disabled `AGENTS.md` plugin or a `CLAUDE.md`-only instruction setting load
`CLAUDE.md` files only, and a personal `CLAUDE.local.md` would otherwise stop
`AGENTS.md` from loading. The shim covers these cases without duplicating
instructions. It applies to Claude Code only; other Claude clients, such as
Claude chat with GitHub-synchronized files, have no documented automatic
instruction-file discovery or import expansion.

## License

This project is licensed under the [MIT License](LICENSE).
