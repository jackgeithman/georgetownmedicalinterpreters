# GMI Database Backups

This branch contains daily compressed PostgreSQL backups of the GMI production database.

- **Schedule:** Every day at 2 AM UTC
- **Retention:** 30 days (older files are automatically deleted)
- **Format:** `backup-YYYY-MM-DD.sql.gz`

## Restoring a Backup

```bash
# From the main branch of the repo:
bash scripts/restore-db.sh backups/backup-YYYY-MM-DD.sql.gz
```

See `scripts/restore-db.sh` for full usage.
