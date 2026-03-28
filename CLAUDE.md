@AGENTS.md

## Project Overview

This is a TypeScript project deployed on Vercel. Always ensure Next.js compatibility (e.g., wrap useSearchParams in Suspense boundaries, check for client/server component boundaries).

## Workflow Rules

After making multi-file changes or feature implementations, run `npm run build` (or the project's build command) before committing to catch build errors early.

## Environment Setup

When working on deployment or infrastructure tasks (Vercel, Google OAuth, external services), verify that required CLI tools (gh, gcloud, vercel) are installed before starting multi-step configuration workflows.
