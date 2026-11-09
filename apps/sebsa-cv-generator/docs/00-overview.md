# SEBSA CV Generator — Documentation Index

This `docs/` folder is the source of truth for the backend migration: turning the existing
mock Next.js UI into a production MVP backed by Supabase, real file parsing, and an
AI provider abstraction. Keep the UI as-is; these documents describe everything underneath it.

| Doc | Purpose |
|---|---|
| [01-spec-alignment.md](./01-spec-alignment.md) | Maps the Functional Spec requirements to this plan; flags gaps/decisions |
| [02-architecture.md](./02-architecture.md) | System architecture, folder structure, request flow |
| [03-database-schema.md](./03-database-schema.md) | Full Postgres schema, tables, indexes, foreign keys |
| [04-rbac-security.md](./04-rbac-security.md) | Roles, permissions matrix, Row Level Security policy design |
| [05-ai-provider-abstraction.md](./05-ai-provider-abstraction.md) | AI provider interface, Gemini implementation, future Claude swap |
| [06-phase-plan.md](./06-phase-plan.md) | Reconciled, incremental implementation phases (current status tracked here) |

## Ground rules carried through every phase

- **No UI redesign.** Existing pages/components/Tailwind styling stay; only their data sources change (mock state → Supabase/Server Actions/Route Handlers).
- **React Context is UI-state only** going forward (e.g. sidebar collapse, toasts). Business data flows through Server Components, Server Actions, and Route Handlers.
- **AI is never called directly from business logic.** Everything goes through `lib/ai/provider.ts`'s interface so Gemini can be swapped for Claude later with zero call-site changes.
- **The AI must never fabricate** companies, employment history, projects, awards, certifications, dates, or names. It may reword, re-summarize, reorder, and emphasize.
- **Incremental delivery.** Each phase in [06-phase-plan.md](./06-phase-plan.md) is self-contained, stops for confirmation, and leaves the app in a working state.
