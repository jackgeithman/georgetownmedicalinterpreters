#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-db.sh — Restore a GMI database backup
#
# Usage:
#   bash scripts/restore-db.sh <path-to-backup.sql.gz>
#
# Example:
#   bash scripts/restore-db.sh ~/Downloads/backup-2026-04-23.sql.gz
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Default connection URL (session mode pooler — works from local Mac) ───────
DEFAULT_DB_URL="postgresql://postgres.tosxvyspbdwxajkcduqs:FourPottedPothosPlayingInPuddles@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

BACKUP_FILE="${1:?Error: backup file required. Usage: bash scripts/restore-db.sh <backup.sql.gz>}"
DB_URL="${2:-${SUPABASE_DB_URL:-$DEFAULT_DB_URL}}"

# ── Validate inputs ───────────────────────────────────────────────────────────

if [ -z "$DB_URL" ]; then
  echo ""
  echo "Error: database URL not set."
  echo "Set SUPABASE_DB_URL in your environment or pass it as a second argument."
  echo ""
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo ""
  echo "Error: file not found: $BACKUP_FILE"
  echo ""
  exit 1
fi

# ── Confirmation prompt ───────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════"
echo "  GMI Database Restore"
echo "══════════════════════════════════════════════════"
echo ""
echo "  Backup file : $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"
echo "  Target DB   : ${DB_URL%%@*}@..."
echo ""
echo "  ⚠️  WARNING: This will overwrite all existing data."
echo "  Make sure the app is not receiving live traffic."
echo ""
read -rp "  Type YES to confirm restore: " confirm
echo ""

if [ "$confirm" != "YES" ]; then
  echo "Aborted. No changes were made."
  exit 0
fi

# ── Restore ───────────────────────────────────────────────────────────────────

echo "Restoring..."
gunzip -c "$BACKUP_FILE" | psql "$DB_URL" --quiet

echo ""
echo "✓ Restore complete from: $BACKUP_FILE"
echo ""
