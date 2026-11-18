# Linear public snapshots

Public, read-only snapshots of Linear issues, published with GitHub Pages.

- Site: https://matiasmacarioo.github.io/linear-public/
- Example: https://matiasmacarioo.github.io/linear-public/MUT-173.html

## Sync

`.github/workflows/sync-linear-issues.yml` runs every 15 minutes and also supports manual dispatch.

It:
1. Reads the issue from the Linear API.
2. Regenerates the issue HTML.
3. Downloads the issue images into `assets/<ISSUE-ID>/`.
4. Commits the result to `main`.

### Required secret

Add a repository secret named `LINEAR_API_KEY` with a Linear personal API key.

Without that secret the workflow fails on purpose.

### Issues to sync

Edit the `ISSUES` env var in the workflow:

```yaml
env:
  LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
  ISSUES: MUT-173
```

Use a space-separated list for multiple issues, for example `MUT-173 MUT-176`.

## Notes

- The snapshots are public. Do not sync issues with sensitive data.
- Linear remains the source of truth. The page is a one-way mirror.
