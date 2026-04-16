## Start Dev Preview

Spin up the local Next.js dev server and open a live preview so the user can see changes in real time.

### Steps

1. **Check environment** — confirm we are inside a git worktree (not main). Run:
   ```
   git rev-parse --abbrev-ref HEAD
   ```
   If on `main`, warn the user: "You're on main — create a new worktree branch first before making changes."

2. **Install dependencies if needed** — check whether `node_modules` exists in the current worktree directory. If not (worktrees don't share node_modules), run `npm install`.

3. **Start the dev server** — use the `preview_start` tool with:
   - command: `npm run dev`
   - port: `3000`

4. **Wait for ready** — poll `preview_logs` until the Next.js "Ready" message appears (up to ~30 seconds).

5. **Take a screenshot** — use `preview_screenshot` and show it to the user so they can confirm the site loaded.

6. **Tell the user**:
   - The preview is live at localhost:3000
   - Changes made to files will hot-reload automatically
   - When done: type `/pr` to create a pull request, or `/discard` to throw away changes and delete this branch
