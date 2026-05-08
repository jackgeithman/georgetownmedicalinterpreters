#!/usr/bin/env tsx
/**
 * CLI seed runner.
 * Usage: npm run db:seed
 */

import { runSeed } from "../src/lib/dev-seed";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error("This script only runs in development mode.");
    process.exit(1);
  }
  await runSeed();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
