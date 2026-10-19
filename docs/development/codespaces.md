# iPhone preview with GitHub Codespaces

This is an **opt-in**, temporary development preview, not a public deployment.
It runs the repository's existing React/Vite frontend, Spring Boot backend, and
PostgreSQL 18 in a Codespace. Use it to inspect Codex PR changes from Safari
without needing a PC or Mac. The preview uses a fresh, independent development
database; it does not share the local demo or any production data.

## Create a preview

1. After the Codespaces setup PR has been reviewed and merged to `main`, open the
   repository on GitHub in Safari and choose **Code → Codespaces → New with options**.
   Select the **branch belonging to the PR you want to test** and create a
   codespace. For the first setup test (before merging), select the **setup PR's
   branch** instead; another PR branch will not yet contain this configuration.
2. Choose a machine with sufficient memory for Java, PostgreSQL and Vite;
   a 4-core machine may be more reliable than 2 cores. Codespaces consumption
   depends on machine size and running time.
3. On first creation, the dev container installs Node 24, sets up Docker, and
   runs `npm ci` for the frontend. On each start, the startup script prepares an
   isolated local database, starts Spring Boot on port 8080 and Vite on port
   5173. The first backend startup may take longer while Maven fetches dependencies.
4. In the Codespaces browser editor, open the **Ports** panel and use the
   forwarded **5173 – MTG Commander Stats (iPhone)** HTTPS address. Its visibility
   should remain **Private**. Sign in to GitHub if prompted. Safari can open the
   address in a separate tab. Wait until the backend has started before trying
   login or registration.
5. Register a **throwaway test account** and exercise the changed screens. The
   database is empty until you create test data; no real account data or demo
   credentials are automatically seeded.
6. After testing, visit <https://github.com/codespaces> and **Stop codespace**.
   Closing a Safari tab does **not** stop compute billing. Resume the same
   codespace to preserve its development database, or delete it when no longer
   needed. A stopped codespace can still count toward storage usage.

Codex Cloud and Codespaces are separate workspaces. Codex must push its PR branch
to GitHub before you can test those changes. To test later commits on the same
branch, pull them into the codespace. If dependencies or the dev container config
change, rebuild the container; if the PR branch lacks the setup configuration,
use `main` after this setup PR is merged or recreate from a supported branch.

## Security and troubleshooting

- Only port **5173** is forwarded. Vite proxies `/api` to the loopback Spring
  Boot backend on **8080**; PostgreSQL is bound to **127.0.0.1:5432**. Do **not**
  make the forwarded port public. GitHub's private port requires GitHub
  authentication. The Vite host allowlist is limited to this codespace's URL.
- A random database password is generated locally at
  `~/.config/mtg-commander-stats/postgres-password` and is never committed.
  The password is reused with the existing Docker volume. Never copy the file,
  credentials, cookies, tokens or invitation codes into commits or issue/PR logs.
- If the page loads but API calls fail, check the backend startup log. The first
  Maven run can take time; Vite might become available first. Inspect the logs in
  the Codespaces terminal without sharing secrets:

  ```bash
  tail -n 80 ~/.local/state/mtg-commander-stats/backend.log
  tail -n 80 ~/.local/state/mtg-commander-stats/frontend.log
  ```

- If startup fails after resuming, manually rerun
  `bash .devcontainer/start.sh` in a Codespaces terminal and inspect the output.
  After switching PR branches, frontend dependency changes may require
  `npm ci --prefix frontend` and restarting Vite.
- Do not run `docker compose down -v` unless you intentionally want to delete the
  preview database. This setup is **not** a permanent hosted service; Codespaces
  pauses/stops and may be deleted according to your account's settings.
- A browser preview does not replace automated tests, CI, independent review,
  or physical-device acceptance on an actual iPhone.
