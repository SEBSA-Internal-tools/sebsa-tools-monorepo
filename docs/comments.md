# Comments

Threaded discussion on a case or a task. One table, `comments`, already existed
in the schema — no migration was required to ship this.

---

## Model

`Comment` carries a nullable `caseId` and `taskId`; exactly one is set. That is
enforced in `CommentsService.resolveTarget()`, which rejects zero or both,
rather than by a database constraint — Prisma cannot express "exactly one of
these two columns".

`parentCommentId` gives replies. Threading is **one level deep**: replying to a
reply is rejected, so the UI never has to nest indefinitely.

Deletes are soft (`deletedAt`), which keeps replies addressable and preserves
the activity trail.

`CommentMention` records who was mentioned. Mentions are replaced wholesale on
edit, so removing an `@` from the text removes the mention row with it.

## API

All routes sit behind `JwtAuthGuard` and resolve the owning project before doing
anything.

| Route | Notes |
| --- | --- |
| `GET /api/comments?caseId=` or `?taskId=` | Whole thread, oldest first, assembled into parent → replies |
| `POST /api/comments` | `parentCommentId` makes it a reply |
| `PATCH /api/comments/:id` | Author or admin. Sets `isEdited` |
| `DELETE /api/comments/:id` | Author or admin. Soft delete |

**Permissions.** Reading follows the same project-visibility rule as the entity
itself. Posting additionally requires a non-read-only project role. Editing and
deleting are restricted to the author, or `ADMIN`/`SUPER_ADMIN`.

**Limits.** Body is capped at 5,000 characters and mentions at 25 per comment,
enforced by the DTO.

**Reply integrity.** A reply must belong to the same thread as its parent —
otherwise a caller could graft a comment onto a project they cannot see.

## Mentions

### Picking someone

The composer offers an inline autocomplete rather than a separate picker.
Typing `@` opens a filtered list of project members; arrow keys move through it,
Enter or Tab selects, Escape closes. Selecting inserts `@Name ` at the caret.

An `@` only opens the list at the start of the text or after whitespace, so an
email address typed into a comment never triggers it.

A pick counts as a mention only while its `@Name` is still present in the body,
so deleting the text removes the mention with no extra bookkeeping. The set is
recomputed from the text when the comment is posted.

### Validation

`mentionedUserIds` is filtered down to **active members of that project** before
anything is written. Ids that don't qualify are dropped silently rather than
erroring, so the field cannot be used to probe for users outside the project.

Each surviving mention (excluding self-mentions) produces a `MENTION`
notification. Dispatch is fire-and-forget — a notification failure must not fail
the comment.

## Activity trail

Posting a comment writes a `COMMENTED` entry to `activity_logs` inside the same
transaction as the comment itself, so it appears in the entity's activity feed
and the audit log. Edits and deletes do not currently write entries; the comment
row's own `updatedAt`/`deletedAt` carry that.

## Frontend

`CommentSectionComponent` (`core/components/comment-section/`) is shared by the
case and task detail pages, mounted below the Tasks and Dependencies blocks
respectively:

```html
<app-comment-section
  targetType="CASE"
  [targetId]="kase.id"
  [mentionableUsers]="availableAssignees()"
></app-comment-section>
```

It supports posting, replying, editing and deleting, with `canModify` coming
from the server rather than being inferred client-side.

**Rendering is deliberately plain.** Bodies bind through `{{ }}` — never
`innerHTML` — and line breaks come from `white-space: pre-wrap`. There is no
markdown or HTML rendering, which is what keeps a comment from becoming an XSS
vector. Mentions display as chips beside the text rather than being parsed and
substituted into it, for the same reason.
