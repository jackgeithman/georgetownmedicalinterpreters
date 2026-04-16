## Create PR and Push to Main

Verify the build, commit all changes, push the current branch, and open a pull request against main.

### Steps

1. **Stop the dev server** — if a preview is running, use `preview_stop` to shut it down cleanly.

2. **Build check** — run `npm run build`. If it fails, fix all errors before continuing.

3. **Stage and commit** — run `git add -A`, then craft a concise commit message describing what changed and why. Commit using:
   ```
   git commit -m "$(cat <<'EOF'
   <message>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   EOF
   )"
   ```

4. **Push branch** — run:
   ```
   git push -u origin HEAD
   ```

5. **Create PR** — run `gh pr create --base main` with:
   - A short title (under 70 chars)
   - A body summarizing: what changed, why, and how to test it

6. **Report** — show the PR URL to the user.
