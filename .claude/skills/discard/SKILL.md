## Discard Changes and Clean Up Branch

Tear down the dev server and permanently delete the current worktree branch. Use this when you want to throw away all changes and return to a clean state.

### Steps

1. **Confirm with user** — ask: "This will permanently delete all uncommitted changes and the branch `<current-branch>`. Are you sure?"
   - Wait for confirmation before proceeding.

2. **Stop the dev server** — use `preview_stop` to shut down any running preview server.

3. **Get branch name** — run:
   ```
   git rev-parse --abbrev-ref HEAD
   ```
   Save the branch name. If it is `main`, abort and tell the user: "Refusing to delete main."

4. **Get the worktree path** — run:
   ```
   git worktree list --porcelain
   ```
   Find the path for the current branch.

5. **Remove the worktree** — from the main repo root, run:
   ```
   git -C /Users/jackgeithman/georgetownmedicalinterpreters worktree remove --force "<worktree-path>"
   ```

6. **Delete the branch** — run:
   ```
   git -C /Users/jackgeithman/georgetownmedicalinterpreters branch -D "<branch-name>"
   ```

7. **Confirm to the user** — say: "Branch `<branch-name>` and all changes have been deleted. Start a fresh session to begin new work."
