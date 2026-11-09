# Sending email through Microsoft Graph

The portal can send its emails (invitations, notifications) as a shared Microsoft 365 mailbox through
Microsoft Graph, instead of Brevo's SMTP relay. Mail is internal, so it stays inside the tenant.

Which transport is used is one setting, `EMAIL_PROVIDER`:

| Value | Behaviour |
|---|---|
| `brevo` (default) | Unchanged: Brevo SMTP relay, using the `BREVO_*` settings. |
| `graph` | Microsoft Graph `sendMail`, sent **as** `GRAPH_SENDER`. |

Switching back is changing that one value (and redeploying/restarting). There is no automatic
fallback between the two: a misconfiguration should be visible, not hidden.

## How it works

`lib/email/sendEmail.ts` is the single entry point (`sendEmail(to, content)`); its callers do not
change. With `EMAIL_PROVIDER=graph` it uses `lib/email/graphMail.ts`, which:

1. Requests an **app-only** token (client-credentials) for `https://graph.microsoft.com/.default`,
   caches it until shortly before it expires, and shares one request between concurrent sends.
2. `POST https://graph.microsoft.com/v1.0/users/{GRAPH_SENDER}/sendMail` with the HTML body, the
   recipient, optional base64 attachments, and `saveToSentItems: true`.
3. Retries only what can succeed on retry: HTTP 401 (refreshes the token once), 429/5xx (honours
   `Retry-After`, otherwise 1 s, 2 s, 4 s). It refuses to wait longer than 10 s so a web request
   never hangs. 400/403/404 are not retried.
4. Keeps at most 3 sends in flight (Graph allows about 4 per mailbox).
5. Rejects malformed recipients (anything that is not one plain address) before contacting Microsoft.

Failures are logged (status, error code, request id; **never** the recipient or the secret) and
`sendEmail` returns `false`, exactly as it does for Brevo. A mail problem must not break the action
it belongs to.

Differences from Brevo: the sender name is the mailbox's own display name (not `EMAIL_FROM_NAME`),
and only the HTML part is sent (Graph carries one body).

## Which emails use this

With `EMAIL_PROVIDER=graph`, **every** email the portal sends goes out as the shared mailbox:

- account invitations and re-sent invitations
- profile review / approval notifications
- **password-reset links** (forgot password)
- **signup confirmation links**

The last two used to be sent by Supabase's own mailer. They are now created with Supabase's admin
`generateLink` (which only mints the link and sends nothing) and delivered by `sendEmail`, exactly like
invitations (`lib/auth/authEmails.ts`). Supabase's Authentication, SMTP settings are no longer used by
the app and can be left as they are.

Behaviour worth knowing:

- **No account oracle.** The forgot-password and signup screens answer identically whether or not an
  address has an account. Reset sending happens after the response, so timing does not reveal it either.
- **Limits** (per server instance, best effort): one reset email per address per minute and 10 per IP per
  10 minutes; signup 3 per address and 5 per IP per hour. Because the endpoints are public, also add a
  Vercel Firewall rate-limit rule on `/auth/forgot-password` and `/signup` for a hard guarantee, and so one
  abuser cannot use up the shared mailbox's sending quota (invitations share it).
- **Deactivated accounts** are not sent reset links.
- **Signup rollback.** If the confirmation email cannot be sent, the new account is removed again.
- **Links work from any device.** A reset or confirmation link no longer has to be opened in the same
  browser that requested it. Confirming a signup also signs the person in.
- **Redirect URLs must allow query strings.** The links return to `/auth/callback?flow=recovery&next=...`
  and `/auth/callback?next=/dashboard`. Supabase ignores a redirect with a query string unless the
  Redirect URLs list has a wildcard entry such as `https://sebsa-cv-generator.vercel.app/**`; otherwise it
  silently sends people to the Site URL. `NEXT_PUBLIC_APP_URL` must be the production site URL.

## What must exist in Microsoft 365 (IT)

- A **mailbox** to send as (shared mailbox is fine): `cv.generator@sebsaworld.com`.
- The Entra app (`GRAPH_CLIENT_ID`) has the Microsoft Graph **application** permission `Mail.Send`
  with admin consent.
- An Exchange **Application Access Policy** (or RBAC for Applications) that limits that app to this
  one mailbox. Without it `Mail.Send` can send as **anyone** in the company. Check:
  ```powershell
  Test-ApplicationAccessPolicy -Identity cv.generator@sebsaworld.com -AppId <client id>   # Granted
  Test-ApplicationAccessPolicy -Identity <any other mailbox>        -AppId <client id>   # Denied
  ```
  A new policy can take up to about 30 minutes to apply.
- A **client secret** for the app. Use the secret **Value**, not the Secret ID.

## Settings

| Variable | Value |
|---|---|
| `EMAIL_PROVIDER` | `graph` |
| `GRAPH_TENANT_ID` | `088ce82f-bf1a-4ff3-a516-626b8524875b` |
| `GRAPH_CLIENT_ID` | the app's Application (client) ID |
| `GRAPH_CLIENT_SECRET` | the secret **Value** (server-only; Vercel Production env, never committed) |
| `GRAPH_SENDER` | `cv.generator@sebsaworld.com` |

Today these point at the same app registration that signs people in. When a dedicated mail app is
created (and shared with other systems), change only `GRAPH_CLIENT_ID` and `GRAPH_CLIENT_SECRET`.

## Testing locally

1. Put the secret Value in `.env.mail-test` (gitignored; the file is already set up with the other
   values). Do not paste it anywhere else.
2. Unit tests, no network or secret needed: `node --test tests/graph-mail.test.cjs`
3. See what would be sent, without contacting Microsoft:
   ```bash
   npx --yes dotenv-cli -e .env.mail-test -- npx --yes tsx --tsconfig tsconfig.json scripts/send-test-mail.ts colleague@sebsaworld.com --dry-run
   ```
4. Send one real test message (get the recipient's consent first):
   ```bash
   npx --yes dotenv-cli -e .env.mail-test -- npx --yes tsx --tsconfig tsconfig.json scripts/send-test-mail.ts colleague@sebsaworld.com
   ```
   The script only sends to `@sebsaworld.com`, to exactly one recipient. Expect `HTTP 202`, the
   message in the recipient's inbox from the shared mailbox, and a copy in the mailbox's Sent Items.

## Going live

1. Set the five variables in Vercel, **Production** environment only, keeping `EMAIL_PROVIDER=brevo`
   at first, then redeploy. Nothing changes yet.
2. Change `EMAIL_PROVIDER` to `graph` and redeploy. Send one real invitation to a colleague.
3. Watch the Vercel logs for `Failed to send email via Microsoft Graph` for a few days. Keep the
   Brevo settings in place for about a week so rollback is a one-value change.

Rollback: set `EMAIL_PROVIDER=brevo` and redeploy.

## Troubleshooting

| Result | Meaning and fix |
|---|---|
| `invalid_client` / `AADSTS7000215` | Wrong secret: you used the Secret ID, an old/rotated secret, or the wrong app. Use the secret **Value**. |
| `invalid_request` / `AADSTS90002` | Wrong `GRAPH_TENANT_ID`. |
| `ErrorAccessDenied` (HTTP 403) | The app may not send as that mailbox: `Mail.Send` not consented, the Application Access Policy excludes the mailbox, or the policy was just created (wait up to ~30 min). Run the `Test-ApplicationAccessPolicy` commands above. |
| `ErrorInvalidUser` / `MailboxNotEnabledForRESTAPI` / HTTP 404 | `GRAPH_SENDER` is not a real mailbox (for example a distribution list or alias). |
| `invalid_recipient` | The recipient is not a single plain address. Nothing was sent. |
| HTTP 429 | Microsoft is throttling the mailbox. The sender waits and retries; a very large batch just takes longer. |
| `network_error` | Could not reach Microsoft (outage or firewall). Retried automatically. |
| Message never arrives but HTTP 202 | Check the recipient's Junk folder and the mailbox's Sent Items, and the Exchange message trace. |

Quote the `request-id` from the log or script output when asking IT or Microsoft to trace a message.
