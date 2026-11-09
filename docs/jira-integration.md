# Jira Integration

**One-way: Jira → here.** Nothing this application does ever reaches Jira.

That is enforced structurally, not by convention — `JiraClientService` has no
`createIssue`, `updateIssue` or `transitionIssue` method, so there is no write
call to reach by mistake. If a future requirement needs to push, that is a
deliberate change to the client, not an accident.

---

## What links to what

A Jira issue attaches to a **Case**, not a Task. Two levels of linking:

| Link | Where | Stored on |
| --- | --- | --- |
| Project → Jira project | Project detail → **Integrations** tab | `Integration` (type `JIRA`) |
| Case → Jira issue | Case detail → **Jira** card in the sidebar | `Case.jiraIssueKey` |

A project must be connected before any of its cases can link — the case-level
call refuses otherwise. The project key is verified against Jira when you
connect, so a typo is reported there rather than failing silently on every
later poll.

Disconnecting a project switches the integration off but leaves its cases
holding whatever they last pulled; clearing them would wipe visible data, so
unlinking a case stays a separate, per-case action.

Both require `canConfigureIntegrations` on the caller's project role, or a
system ADMIN/SUPER_ADMIN.

**Linking is explicit.** An issue nobody has linked is ignored, so a linked
project's board does not fill with unrelated Jira issues. `pullIssueIntoCase`
looks the issue key up and returns quietly when there is no match — an unknown
key is not an error, it is simply not ours.

`DELETE /api/cases/:id/jira/link` detaches the issue and clears what came from
it, leaving the case's own fields untouched.

## What comes across

Two fields, and **both are stored separately from the case's own**:

- **`jiraStatusLabel`** — the issue's status name, shown as its own chip beside
  our status. Our statuses are configured globally and a Jira workflow rarely
  lines up with them, so the two are displayed side by side rather than one
  being mapped onto the other. There is deliberately no status translation.
- **`jiraDescription`** — the issue's description, rendered under its own
  heading. Kept apart from `Case.description` so a pull can never overwrite
  what someone wrote here.

`jiraSyncedAt` records the Jira `updated` timestamp of the last change pulled
in. A repeated webhook or an overlapping poll window replays the same change;
comparing against this is what tells a genuine edit from a duplicate.

## How changes arrive

**Webhook** — `POST /api/jira/webhook`, unauthenticated because Jira cannot
send our JWT. It is safe because it grants nothing: the payload is matched
against a linked case by issue key, and anything unrecognised is dropped. Point
a Jira Automation "Send web request" rule at it for issue create/update.

**Polling** — a safety net behind the webhook, every 2 minutes with a 10-minute
JQL window so a slow tick cannot leave a gap. **Off unless
`JIRA_POLLING_ENABLED=true`**, because it reads every recently-changed issue in
the linked project. With link-only semantics the unmatched ones are discarded,
but the API calls are still made.

## Configuration

`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` and
`JIRA_CLOUD_ID` in `.env` — all optional. With any missing, `isConfigured()`
returns false and every entry point becomes a no-op rather than an error.

A scoped API token must be called through `api.atlassian.com/ex/jira/{cloudId}/`
rather than the site URL, or requests silently return empty results instead of
failing. That is what `JIRA_CLOUD_ID` is for.

## Rendering

The case detail page shows a **Jira** card in the sidebar (issue key, status
chip, last-synced time, link/change/unlink) and a **Description from Jira**
block in the main column, marked read-only with the issue key.

The status chip is deliberately styled unlike our own — dashed border, different
palette — because it is Jira's vocabulary sitting next to ours, and the two
should not be mistaken for each other.

## Not covered

Task-level Jira links are gone; `Task.jiraStatusLabel` and
`Subtask.jiraStatusLabel` remain as free-text fields a team can type into by
hand, with no sync behind them.

Assignee, priority, issue type and labels are not pulled. Priority mirroring was
removed with the two-way sync — it created project priorities from Jira's list,
which no longer fits now that priorities are configured globally.
