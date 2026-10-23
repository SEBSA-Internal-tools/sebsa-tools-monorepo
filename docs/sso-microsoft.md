# Microsoft (Entra ID) single sign-on

Employees sign in with their SEBSA Microsoft account. Supabase Auth does the OAuth exchange (its
built-in **Azure** provider), so the application itself holds no Microsoft secret. Password login
stays available as a break-glass option while SSO rolls out.

## How it works

1. The login page shows **Sign in with Microsoft** when `NEXT_PUBLIC_SSO_MICROSOFT_ENABLED=true`.
2. The browser goes to Supabase (`/auth/v1/authorize?provider=azure`), which redirects to
   `login.microsoftonline.com/<tenant-id>/...` for the SEBSA directory only (single tenant).
3. Microsoft returns to **Supabase's** callback (`https://<project-ref>.supabase.co/auth/v1/callback`);
   Supabase exchanges the code with the client secret and creates the session.
4. Supabase sends the browser on to the app's `/auth/callback`, which completes the PKCE exchange and
   continues to `/dashboard`.
5. A first-time user is created as an **Employee** (the existing `handle_new_user` trigger). With no
   profile yet they land in `/onboarding`, where they can claim an existing profile matching their
   email.

The app registration: **App ID** `11084482-d34a-4a0e-a021-4c11e775ec52`, tenant
`088ce82f-bf1a-4ff3-a516-626b8524875b`. Both are identifiers, not secrets. The **client secret** is
a secret: it lives only in the Supabase dashboard and never in git, Vercel env vars or chat.

## One-time setup (per environment)

An *environment* is one Supabase project (production, and the shared dev project if you use one).

### 1. Entra ID (IT / app owner)

On the app registration:

- **Authentication, Web redirect URIs**: add one per Supabase project that will use it:
  - production: `https://awkjraqmcnvdshxtfbtp.supabase.co/auth/v1/callback`
  - shared dev: `https://kmmxdgrqfliffhewprav.supabase.co/auth/v1/callback`
- **Supported account types**: *Accounts in this organizational directory only*.
- **Token configuration, optional claims**: add `email` to the **ID token**, and `xms_edov` to the ID
  and access tokens. Supabase needs a *verified* email to match an Entra user to an existing
  account. (Equivalent manifest: `optionalClaims` with `email` on `idToken`, `xms_edov` on `idToken`
  and `accessToken`.)
- **Certificates & secrets**: use the secret **Value** (not the Secret ID). Note its expiry date in
  the team calendar: when it expires, SSO stops working until a new secret is pasted into Supabase.

### 2. Supabase dashboard (project owner, per project)

**Authentication, Sign In / Providers, Azure**:

- Enable it.
- **Client ID**: `11084482-d34a-4a0e-a021-4c11e775ec52`
- **Secret**: the client secret Value
- **Azure Tenant URL**: `https://login.microsoftonline.com/088ce82f-bf1a-4ff3-a516-626b8524875b`

**Authentication, URL Configuration**:

- **Site URL**: the app's URL for that environment (production: `https://sebsa-cv-generator.vercel.app`)
- **Redirect URLs**: add `<app URL>/auth/callback`, for example
  `https://sebsa-cv-generator.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`.

### 3. The app (Vercel / env files)

Set `NEXT_PUBLIC_SSO_MICROSOFT_ENABLED=true` for the environment and **redeploy** (NEXT_PUBLIC values
are inlined at build time). Leave it unset or `false` anywhere the Supabase side is not configured
yet: the button then stays hidden.

Rollout order that cannot show a broken button: Entra, then Supabase provider, then Redirect URLs,
then set the flag and deploy.

## Existing password accounts

Supabase links a Microsoft sign-in to an existing account with the **same verified email**, so
people invited earlier by password keep their profile, role and history. This depends on the
`email`/`xms_edov` claims above: without them Entra's email may be treated as unverified and the
sign-in will not link. **Test this with one real colleague before announcing SSO**, and confirm they
land on their existing profile, not an empty onboarding page.

Deactivated accounts (banned in Supabase) cannot sign in with Microsoft either.

## Trying it before production

Build a Vercel **preview** of the branch and give it the flag (Vercel, Settings, Environment Variables:
`NEXT_PUBLIC_SSO_MICROSOFT_ENABLED=true`, scoped to *Preview* and this branch only). A preview has its own URL,
so add a wildcard to the Supabase **Redirect URLs**, for example
`https://sebsa-cv-generator-git-*-<team>.vercel.app/auth/callback`. Previews use whatever Supabase keys the
Preview environment is given: scope any production keys to this branch only, never to all previews.
Locally, `http://localhost:3000/auth/callback` must also be in Redirect URLs, and Azure rejects
`127.0.0.1` as a host, so browse via `localhost`.

## After the secret was shared in chat

The client secret was pasted into a chat on 2026-10-23. Create a new secret in Entra, put it in
Supabase, and delete the old one once SSO works.

## Later steps (not done yet)

- Remove password sign-in, `/signup` and the set-password invite flow once everyone has used SSO;
  keep one break-glass Super Admin password.
- The "invite" mail still says "set a password"; reword it for SSO.
- Map Entra groups to roles instead of assigning them in Settings, if wanted.
- Restrict first-time sign-ups to `@sebsaworld.com` addresses (guest accounts in the tenant could
  otherwise create an Employee account).
