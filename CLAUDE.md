@AGENTS.md

## Project Overview

This is a TypeScript project deployed on Vercel. Always ensure Next.js compatibility (e.g., wrap useSearchParams in Suspense boundaries, check for client/server component boundaries).

## Workflow Rules

After making multi-file changes or feature implementations, run `npm run build` (or the project's build command) before committing to catch build errors early.

## UI / Styling Rules

**No gray text for readable content.** Use `#111827` (near-black) for all text unless explicitly grayed out for inactive state. Gray text (`#9CA3AF`, `#6B7280`, `#D1D5DB`, `var(--gray-400)`, `var(--gray-500)`, etc.) is only permitted for:
- Past/completed items (e.g., past shifts)
- Disabled buttons or controls that cannot be interacted with
- Placeholder text inside inputs

Never use gray for labels, descriptions, secondary text, section headers, or any content the user needs to read.

## Environment Setup

When working on deployment or infrastructure tasks (Vercel, Google OAuth, external services), verify that required CLI tools (gh, gcloud, vercel) are installed before starting multi-step configuration workflows.
