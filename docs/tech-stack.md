# SEBSA CV Generator – Tech Stack

Single Next.js application with one root `package.json`. The project uses the App Router for
the UI, Server Components and Server Actions for server-side operations, and one Route Handler
for CV parsing. Supabase provides the managed backend services.

Versions below are the ranges declared in `package.json`; values in parentheses are the versions
currently installed in `node_modules`.

## Application (`app/`)

| Item | Version / details |
|---|---|
| Next.js | ^16.2.10 (installed 16.2.10), App Router, Turbopack by default |
| React / React DOM | ^19.0.1 (installed 19.2.7) |
| TypeScript | ~5.8.2 (installed 5.8.3), target ES2022, bundler module resolution, `strict: false` |
| Styling | Tailwind CSS ^4.1.14 (installed 4.3.2), PostCSS, global CSS |
| Icons | lucide-react ^0.546.0 |
| Animation / visual effects | motion ^12.23.24 (installed 12.42.2), OGL ^1.0.11 |
| Validation | Zod ^4.4.3 |
| Runtime | Node.js (v24.18.0 on the current development machine; `@types/node` ^22.14.0, installed 22.20.0) |
| Package manager | npm 11.16.0, lockfile v3 |

### Next.js architecture

| Piece | Details |
|---|---|
| Server Components | Read authenticated user, profile, repository, dashboard, activity, and generated-CV data |
| Server Actions | Profile creation/update, review and approval, CV generation/persistence, settings, repository, and notifications |
| Route Handlers | `POST /api/parse-cv` accepts extracted CV text and returns structured data from Gemini |
| Session middleware | `proxy.ts` refreshes the Supabase session and protects authenticated routes |
| Client Components | Interactive forms, previews, exports, navigation, and browser-side Supabase Auth flows |
| Business/data layers | `services/` contains orchestration; `repositories/` contains Supabase queries |
| Shared types | `types/domain.ts` and `types/database.ts` |

## Supabase backend

| Item | Version / details |
|---|---|
| Supabase JavaScript client | @supabase/supabase-js ^2.110.1 (installed 2.110.1) |
| Next.js SSR integration | @supabase/ssr ^0.12.0 (installed 0.12.0) |
| Database | Hosted Supabase PostgreSQL; schema managed by SQL migrations |
| Authentication | Supabase Auth with email/password, invite/callback, and password setup flows |
| Authorization | PostgreSQL Row Level Security plus server-side role checks |
| Storage | Supabase Storage buckets for original CVs, generated CVs, and profile pictures |
| Privileged operations | Service-role client in `lib/supabase/admin.ts`, used only on the server |
| Migrations | `supabase/migrations` (30 migrations, `0001_extensions.sql` through `0030_employee_profile_details.sql`) |

### Roles

- `super_admin` – all Admin permissions plus user and role management.
- `admin` – employee/profile administration and CV workflow access.
- `cv_reviewer` – profile review, approval, and reviewer-level access.
- `employee` – self-service onboarding and access to the employee's own profile and CV.

New Supabase Auth users receive the `employee` role automatically through a database trigger.

### Current database tables (9)

- **Identity and organization:** `user_roles`, `departments`
- **Employee CV data:** `profiles`, `experiences`, `projects`, `certifications`
- **Generated output:** `generated_cvs`
- **Operations:** `audit_logs`, `notifications`

The `profiles` table is the central employee record. It includes the profile owner, department,
role, experience, summary, education, availability and publication status, profile picture,
pending claim/change-review data, and optional HR/contact details. Experiences, projects, and
certifications belong to a profile. Projects store their own `skills` array.

`generated_cvs` stores versioned JSON CV content and the AI provider/model metadata. `audit_logs`
is append-only from application clients, while `notifications` stores persistent per-user,
role-aware workflow notifications protected by RLS.

Earlier migrations created `files`, `skills`, `profile_skills`, `opportunities`, `templates`,
`app_settings`, and `notification_preferences`; later migrations deliberately removed those
tables, so they are not part of the current schema.

## AI integration

| Item | Version / details |
|---|---|
| Active SDK in working flows | @google/genai ^2.11.0 (installed 2.11.0) |
| Active model | `gemini-3-flash-preview` |
| Current uses | CV text parsing in `POST /api/parse-cv`; tailored CV content suggestions in a Server Action |
| Structured output | Gemini JSON response schemas are used for predictable parsing |
| Provider abstraction | `AIProvider` factory in `lib/ai/provider.ts`, selected with `AI_PROVIDER=gemini` or `AI_PROVIDER=claude` |
| Legacy Gemini SDK | @google/generative-ai ^0.24.1 (installed 0.24.1), used by the scaffolded `GeminiProvider` |
| Claude SDK | @anthropic-ai/sdk ^0.110.0 (installed 0.110.0) |

The live parsing and CV-suggestion paths currently call `@google/genai` directly. The
provider-agnostic Gemini and Claude classes implement the common interface, but their methods are
still placeholders that throw “not implemented” errors. Therefore, changing `AI_PROVIDER` alone
does not yet switch the working parsing/generation flows to Claude.

## CV import, rendering, and export

| Capability | Package / implementation |
|---|---|
| DOCX text extraction | mammoth ^1.12.0 |
| PDF text extraction | pdfjs-dist ^6.1.200; pdf-parse ^2.4.5 is also installed |
| Browser PDF export | html2canvas ^1.4.1 + jsPDF ^4.2.1 |
| DOCX construction/templates | docx ^9.7.1, docxtemplater ^3.69.0, pizzip ^3.2.0 |
| DOCX images | docxtemplater-image-module-free ^1.1.1 |
| Template rendering | Handlebars ^4.7.9 |
| Additional installed export utility | html-to-docx ^1.8.0 |
| Browser downloads | file-saver ^2.0.5 |

PDF export rasterizes the application CV preview into A4 pages. The template mapping utilities
support DOCX placeholder data and embedded images. CV input accepts browser-extracted PDF/DOCX
text before sending the text to the server-side parsing endpoint.

## Email and notifications

| Item | Version / details |
|---|---|
| Email library | Nodemailer ^9.0.6 |
| Delivery provider | Brevo SMTP relay (`smtp-relay.brevo.com`, port 587) |
| Email use | Transactional workflow notifications and account-related messages |
| In-app notifications | Supabase `notifications` table, read/update limited to the recipient |

Email and notification delivery failures are logged and do not roll back the underlying business
action.

## Tooling, testing, and deployment

| Item | Details |
|---|---|
| Development | `npm run dev` → Next.js dev server on port 3000, bound to `0.0.0.0` |
| Production build | `npm run build` → `next build` |
| Production start | `npm start` → Next.js server on port 3000 |
| Static type check | `npm run lint` → `tsc --noEmit` (despite the script name, ESLint is not installed) |
| Tests | Node's built-in `node:test` is used by `tests/employee-details.test.cjs`; no npm test script is currently defined |
| Deployment target | Vercel, with environment variables configured in project settings |
| CI | No CI pipeline configuration is currently committed |
| Local infrastructure | No Docker or Docker Compose configuration is currently committed; the app uses hosted Supabase |

## Environment variables

Validated centrally with Zod in `lib/env.ts`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/server session client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged Supabase client |
| `AI_PROVIDER` | `gemini` (default) or `claude` for the provider factory |
| `GEMINI_API_KEY` | Google Gemini API access |
| `CLAUDE_API_KEY` | Anthropic API access for the scaffolded Claude provider |
| `NEXT_PUBLIC_APP_URL` | Application origin used for authentication callback links; defaults to `http://localhost:3000` |
| `BREVO_SMTP_KEY` | Brevo SMTP password/key |
| `BREVO_SMTP_LOGIN` | Brevo SMTP login |
| `EMAIL_FROM_ADDRESS` | Verified sender address |
| `EMAIL_FROM_NAME` | Sender display name; defaults to `SEBSA CV Generator` |

`.env.local.example` is the checked-in template. Real secrets belong in `.env.local` locally and
in the deployment platform's environment settings in production.
