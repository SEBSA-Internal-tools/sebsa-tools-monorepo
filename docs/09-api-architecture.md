# API architecture

## The layers

```
component  →  useQuery/useMutation (feature api/)  →  apiClient  →  fetch
                                          ↓
                                  Zod contract parse
```

Each arrow is one-way and each layer has one job:

| Layer | Responsibility |
| --- | --- |
| `src/lib/apiClient.ts` | The **only** place `fetch` is called. Base URL, headers, JSON, error normalisation, contract validation |
| `packages/contracts` | Zod schema per payload; the types are inferred from the schemas |
| feature `api/` | Query and mutation hooks, keys, invalidation |
| component | Renders the result. Never fetches. |

## The client

```ts
const task = await apiClient.get("/tasks/t-001", taskSchema);
```

The schema is a required argument, not an option. That is what makes contract
validation impossible to forget: there is no overload that skips it.

Responsibilities: prefix `VITE_API_BASE_URL`, set headers, send credentials,
parse JSON, throw a normalised error on a non-2xx, and parse the body through
the schema.

## Contracts

Every payload has a Zod schema in `packages/contracts/src/`, and **types are
inferred, never hand-written**:

```ts
export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  status: taskStatusSchema,
  createdAt: z.iso.datetime(),
  reviewerEmail: z.email().optional(),
});
export type Task = z.infer<typeof taskSchema>;
```

A hand-written type says what you *believe* the API returns. A schema *checks*.
When the backend changes shape, the failure is at the boundary with the path of
the offending field, not `undefined` three components deep.

Zod 4 notes: `z.email()` and `z.iso.datetime()` are top-level, not `z.string().email()`.
Avoid `.default()` on a schema used with `zodResolver` — it makes the input and
output types diverge, which breaks the resolver's inference.

## Errors

Every failure is normalised into one shape:

```ts
class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
}
```

with a `ContractViolationError` subclass for a response that fetched fine but
failed validation. (Written with explicit field assignments, because
`erasableSyntaxOnly` bans constructor parameter properties.)

Components read `error.message` for the user and log `error` for the developer.
`error.status` decides the treatment: 401 → sign in, 403 → not-authorised, 404 →
empty state, 5xx → retry affordance.

## Query key convention

Keys are hierarchical and always from the factory:

```ts
["tasks"]                  // everything task-shaped
["tasks", "mine"]          // my list
["tasks", "mine", "kpis"]  // my KPIs
["tasks", "detail", id]    // one task
```

so `invalidateQueries({ queryKey: qk.tasks.all() })` after a mutation refreshes
the list, the KPI row and any open detail at once.

## Adding an endpoint

1. Schema in `packages/contracts/src/<domain>.ts`, exported from its `index.ts`.
2. Handler in `src/mocks/handlers/<domain>Handlers.ts`, including the
   authorization check.
3. Key in `src/lib/queryKeys.ts`.
4. Hook in the feature's `api/`.
5. Test the hook against MSW; test the rule it enforces in `domain/`.

## Conventions

- REST-ish paths, plural nouns: `/tasks`, `/tasks/:id`, `/tasks/:id/reviews`.
- `GET` never mutates.
- Lists are `{ items, total, page, pageSize }` — never a bare array, so
  pagination can be added without a breaking change.
- Timestamps are ISO 8601 UTC; formatting is the client's job.
- Errors are `{ code, message, details? }` with a meaningful HTTP status.
