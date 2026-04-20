## Start Dev Preview

Spin up the local Next.js dev server and open a live preview so the user can see changes in real time.

### Steps

1. **Check environment** — confirm we are inside a git worktree (not main). Run:
   ```
   git rev-parse --abbrev-ref HEAD
   ```
   If on `main`, warn the user: "You're on main — create a new worktree branch first before making changes."

2. **Symlink env files** — worktrees don't inherit `.env` files from the main repo. Without them `NEXTAUTH_SECRET` is missing and every session cookie becomes invalid on server restart (JWT decryption failures). Run:
   ```bash
   MAIN=$(git worktree list --porcelain | grep "^worktree" | head -1 | awk '{print $2}')
   CWD=$(pwd)
   for f in .env .env.local; do
     [ ! -e "$CWD/$f" ] && [ -e "$MAIN/$f" ] && ln -sf "$MAIN/$f" "$CWD/$f" && echo "linked $f"
   done
   ```
   This is idempotent — only creates symlinks if the file is missing in the worktree.

3. **Run the dev sandbox sync** — this snapshots production data into a local isolated database so the dev server never touches production. Run from the worktree directory:
   ```bash
   bash scripts/dev-sandbox.sh
   ```
   This will:
   - Start local PostgreSQL 14 (Homebrew)
   - Create/reset the `gmi_dev` local database
   - Write `.env.development.local` with `DATABASE_URL=postgresql://localhost/gmi_dev`
   - Push the Prisma schema to the local DB
   - Dump production data and restore it locally
   - Seed dev toolbar users (`dev-admin@dev.local`, `dev-volunteer@dev.local`, `dev-instructor@dev.local`)

   After this runs, the toolbar role buttons (Admin / Volunteer / Instructor) will work correctly because the dev users exist in the local DB.

4. **Install dependencies if needed** — check whether `node_modules` exists in the current worktree directory. If not (worktrees don't share node_modules), run `npm install`.

5. **Start the dev server** — use the `preview_start` tool with:
   - command: `npm run dev`
   - port: `3000`

6. **Wait for ready** — poll `preview_logs` until the Next.js "Ready" message appears (up to ~30 seconds).

7. **Take a screenshot** — use `preview_screenshot` and show it to the user so they can confirm the site loaded.

8. **Tell the user**:
   - The preview is live at localhost:3000
   - Changes made to files will hot-reload automatically
   - The local database is a snapshot of production — writes here do NOT affect the live site
   - Re-run `bash scripts/dev-sandbox.sh` any time to refresh with latest production data
   - When done: type `/pr` to create a pull request, or `/discard` to throw away changes and delete this branch
