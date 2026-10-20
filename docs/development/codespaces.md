# iPhone preview with GitHub Codespaces

This is an **opt-in**, temporary development preview, not a public deployment.
It runs React/Vite, Spring Boot and PostgreSQL 18 inside one GitHub Codespace.
The preview database is independent and empty on creation.

## Create a preview

1. Once the setup PR has been reviewed and merged to `main`, open the repository
   on GitHub in Safari and choose **Code → Codespaces → New with options**.
   Select the **branch belonging to the PR you want to test**. Before merging
   the setup PR, select its branch for the first setup test. Other PR branches
   do not yet contain the Codespaces configuration.
2. A four-core machine may be needed for Java, Docker and Node; a smaller
   Codespace may work but must be verified. Creation installs Node 24 and Java
   25 and configures Docker-in-Docker.
3. On startup, the status page starts first, frontend dependencies are installed
   if missing or the lockfile changed, and Vite starts on port 5173 **before**
   Docker/PostgreSQL (5432) and Spring Boot (8080). The first Maven run may
   take time to download dependencies.
4. Open the **private** forwarded HTTPS URL for port **5174 – Status** in the
   Codespaces **Ports** panel. On an iPhone, the URL can also be formed from the
   Codespace name (shown in the editor URL):
   `https://<codespace-name>-5174.app.github.dev/`. The page refreshes every ten
   seconds, shows the latest startup step and whether frontend/backend answer,
   and links to the app on port **5173** when ready. The app address is
   `https://<codespace-name>-5173.app.github.dev/`.
5. When both services report **Bereit**, tap **Anwendung jetzt öffnen**.
   Register a throwaway test account: no demo credentials or existing user data
   are present by default.
6. When finished, visit <https://github.com/codespaces>, select the three-dot
   menu for the Codespace and choose **Stop codespace**. Closing Safari does
   **not** stop compute billing. Stopped Codespaces can still consume storage.

### Testing later changes

Codex Cloud and Codespaces do not share a live workspace. Codex must push the PR
branch to GitHub; the Codespace must then pull changes to that branch. A Codespace
**created before the setup PR was updated will not automatically get the new
status page or changed devcontainer**. After these setup changes, **recreate** a
Codespace from the updated setup branch (or pull changes and rebuild the
container). Recreating uses a fresh preview database; stop/delete old Codespaces
separately. After the setup PR is merged, new Codespaces created from new PR
branches can use the configuration on `main` when their branch contains it.

## Security and troubleshooting

- Ports **5173** (app) and **5174** (read-only status) must remain **Private**.
  Both services listen on **HTTP** inside the Codespace (`portsAttributes.protocol` is `http`).
  GitHub's authenticated port forwarding still gives Safari **HTTPS** addresses;
  do not replace `https://` with `http://` in the browser.
  GitHub requires authentication for private forwarded ports. Do not make them
  public or share private Codespace URLs. Ports 8080 and 5432 are not intentionally
  forwarded. Vite proxies `/api` locally to Spring Boot; PostgreSQL binds to
  `127.0.0.1` only. The status page shows no passwords or log contents.
- PostgreSQL credentials are generated locally in
  `~/.config/mtg-commander-stats/postgres-password`, never committed, and reused
  when the same Codespace resumes. Never share this file, other credentials,
  access tokens or test invitations.
- The status page continues to run if Docker, PostgreSQL or Spring Boot startup
  fails, provided Node and the devcontainer start command itself work. If it
  shows **Noch nicht erreichbar**, inspect the displayed startup step first.
  Status is based on HTTP responses and is not a full end-to-end login test.
- If a development terminal is available, the detailed logs remain in:

  ```bash
  tail -n 80 ~/.local/state/mtg-commander-stats/status-server.log
  tail -n 80 ~/.local/state/mtg-commander-stats/frontend.log
  tail -n 80 ~/.local/state/mtg-commander-stats/backend.log
  ```

- To retry startup in an existing Codespace run `bash .devcontainer/start.sh`.
  Do not run `docker compose down -v` unless the preview database should be
  deleted. A Codespace can stop automatically, and GitHub may eventually delete
  it according to account retention settings.
- A successful status page is not proof of actual Safari compatibility or
  frontend/backend integration. An end-to-end test on an iPhone plus required CI
  checks are still needed before merging.
