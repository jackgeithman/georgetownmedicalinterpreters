#!/bin/bash
# One-time dev environment setup.
# Run: npm run db:setup
# After this, use `npm run db:seed` to reset the DB, and `npm run dev` to start the server.

set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GMI Dev Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Start local PostgreSQL ─────────────────────────────────────────────────
echo "▶ Starting local PostgreSQL..."
brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null || true

# ── 2. Create gmi_dev database ────────────────────────────────────────────────
echo "▶ Creating gmi_dev database (if not exists)..."
createdb gmi_dev 2>/dev/null || echo "  (already exists)"

# ── 3. Write .env.development.local ──────────────────────────────────────────
ENV_FILE=".env.development.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "▶ Writing $ENV_FILE..."
  cat > "$ENV_FILE" <<EOF
# Local dev database — never touches production
DATABASE_URL="postgresql://$(whoami)@localhost/gmi_dev"
DIRECT_URL="postgresql://$(whoami)@localhost/gmi_dev"

# Disable GCal/Gmail in dev (intercepted by dev-logger instead)
# These vars being absent is fine — the interceptor runs first.
# GOOGLE_GMAIL_REFRESH_TOKEN=
# GOOGLE_GMAIL_SENDER_EMAIL=
# GOOGLE_GCAL_CALENDAR_ID=
EOF
  echo "  Written."
else
  echo "  $ENV_FILE already exists — skipping."
fi

# ── 4. Push Prisma schema ─────────────────────────────────────────────────────
echo "▶ Pushing Prisma schema to gmi_dev..."
DATABASE_URL="postgresql://$(whoami)@localhost/gmi_dev" DIRECT_URL="postgresql://$(whoami)@localhost/gmi_dev" npx prisma db push --skip-generate

# ── 5. Seed test data ─────────────────────────────────────────────────────────
echo "▶ Seeding test world..."
npm run db:seed

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Dev environment ready!"
echo ""
echo "  Start dev server:  npm run dev"
echo "  Reset DB anytime:  npm run db:seed"
echo "                     (or click Reset DB in the toolbar)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
