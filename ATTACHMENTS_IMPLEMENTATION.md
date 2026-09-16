# Attachment Upload Feature - Implementation Summary

**Feature:** File attachments on task and case comments, stored locally by default with optional SharePoint integration.

## Overview

Users attach files while composing a comment (or reply) on a task or a case. Files upload right after the comment is posted, appear as a small chip under that comment, and are also listed in full in an "Attachments" section in the task/case sidebar. Storage backend (local disk vs. SharePoint) is chosen automatically based on configuration — no code changes required to switch.

## What Was Implemented

### 1. Backend Services (`apps/ipm-be/src/app/attachments/`)

#### `LocalStorageService`
- Default storage backend — writes files to `<repo>/uploads/{tasks|cases}/{entityId}/{fileName}` (git-ignored)
- Reads/deletes files, sanitizes file names, cleans up empty directories on delete

#### `SharePointService`
- Used instead of local storage once `SHAREPOINT_CLIENT_ID` is set in the environment
- Authenticates with Azure AD via client credentials flow, caches the access token (refreshed 5 minutes before expiry)
- Uploads to a SharePoint drive under `{tasks|cases}/{entityId}/{fileName}`, auto-creating folders as needed

#### `AttachmentsService`
- Orchestrates upload: verifies the task/case exists, picks the active storage backend, then creates the DB record
- **Respects the DB's `attachments_exactly_one_parent` CHECK constraint** — an attachment tied to a comment gets `commentId` set only (never `taskId`/`caseId` alongside it); a legacy/direct attachment gets exactly one of `taskId`/`caseId`
- `getAttachmentsByTask` / `getAttachmentsByCase` — list all attachments for an entity by matching either a direct `taskId`/`caseId` OR via `comment.taskId`/`comment.caseId`, since comment-linked attachments don't carry the parent id directly
- `getFileForDownload` — looks up an attachment by `filePath` and returns its bytes (local storage only — SharePoint-stored files must be opened in SharePoint)
- `deleteAttachment` — uploader or admin only

#### `AttachmentsController`
- `POST /api/attachments/upload` — accepts either `taskId` or `caseId` (exactly one required) plus an optional `commentId`, multipart file, 50MB limit
- `GET /api/attachments/task/:taskId` — all attachments for a task
- `GET /api/attachments/case/:caseId` — all attachments for a case
- `GET /api/attachments/download/:filePath` — streams the file back with correct `Content-Type`/`Content-Disposition`
- `DELETE /api/attachments/:attachmentId`
- All routes require JWT auth (`JwtAuthGuard`)

#### `AttachmentsModule`
- Imports `PrismaModule` and `AuthModule` (the latter needed because the controller's guard depends on `JwtService`)
- Registered in `AppModule`

### 2. Frontend

#### `AttachmentsService` (`apps/ipm-fe/src/app/core/services/attachments.service.ts`)
- `uploadAttachment(file, targetType, targetId, commentId?)` — `targetType` is `'TASK' | 'CASE'` (reuses `CommentTargetType`), picks the right query param
- `getTaskAttachments(taskId)` / `getCaseAttachments(caseId)`
- `deleteAttachment(attachmentId)`
- `downloadFile(filePath)` — returns an `Observable<Blob>`, **not** a plain URL. The download route is authenticated, so the file must be fetched through `HttpClient` (which the auth interceptor attaches a bearer token to) rather than a raw `<a href>` click, which carries no auth header at all.

#### Comment composer (`CommentSectionComponent`)
- File picker lives inline in the composer (📎 button + hidden `<input type="file" multiple>`), not a separate upload button
- Selected files are listed (with remove buttons) before posting
- On `post()`, the comment is created first; once it succeeds, each selected file uploads tagged with that comment's id and the entity's own `targetType`/`targetId`
- Each comment/reply that has attachments renders them as small clickable chips (`📎 filename.ext`) under its text — clicking a chip downloads that file
- No delete-from-comment UI; attachment lifecycle (viewing the full list, deleting) lives in the sidebar component instead

#### `TaskAttachmentsComponent` (`apps/ipm-fe/src/app/core/components/task-attachments/`)
- Generic despite the name — takes `targetType: CommentTargetType` (defaults to `'TASK'`) and `targetId`, so the same component is reused for both task and case detail pages
- Lists every attachment for the entity (via the comment-inclusive queries above), with file icon by mime type, size, uploader, upload date, download and delete actions
- Lives in the sidebar, placed after the Activity section on both `task-detail.page.html` and `case-detail.page.html`

### 3. Data Models

- `libs/shared-models/src/lib/attachments/attachment.models.ts` — `AttachmentSummary`, `CreateAttachmentRequest`, `UploadAttachmentResponse`
- `CommentSummary` (`libs/shared-models/src/lib/comments/comment.models.ts`) — has an optional `attachments` array (id, fileName, fileSize, mimeType, filePath, uploadedBy, createdAt), populated by the backend's `commentInclude` query

### 4. Database Schema

The `Attachment` table already existed in the Prisma schema:
```prisma
model Attachment {
  id           String   @id @default(uuid())
  caseId       String?
  taskId       String?
  commentId    String?
  fileName     String
  filePath     String
  fileSize     Int
  mimeType     String
  uploadedById String
  createdAt    DateTime @default(now())

  case       Case?    @relation(...)
  task       Task?    @relation(...)
  comment    Comment? @relation(...)
  uploadedBy User     @relation(...)
}
```

**Constraint:** a hand-added CHECK constraint (`attachments_exactly_one_parent`) requires exactly one of `caseId`/`taskId`/`commentId` to be non-null. This drove the design of `uploadAttachment`/`getAttachmentsByTask`/`getAttachmentsByCase` above — an early version of this feature set both `taskId` and `commentId` together and every comment-attached upload failed silently with a Postgres `23514` error until that was fixed.

### 5. API Reference

#### Upload
```
POST /api/attachments/upload?taskId={uuid}&commentId={uuid}   (or ?caseId={uuid}&commentId={uuid})
Content-Type: multipart/form-data
Authorization: Bearer {jwt_token}
Body: file: File (binary)

Response 201:
{
  id, fileName, fileSize, mimeType, filePath,
  uploadedBy: { id, name },
  createdAt
}
```

#### List
```
GET /api/attachments/task/:taskId
GET /api/attachments/case/:caseId
→ UploadAttachmentResponse[]
```

#### Download
```
GET /api/attachments/download/:filePath   (filePath URL-encoded, e.g. tasks%2F{taskId}%2Ffile.pdf)
→ raw file bytes, Content-Disposition: attachment
```

#### Delete
```
DELETE /api/attachments/:attachmentId
→ { message: string }
```

## Configuration

### Environment Variables (`.env`) — all optional, local storage is the default
```env
SHAREPOINT_CLIENT_ID=<Azure AD Application ID>
SHAREPOINT_CLIENT_SECRET=<Azure AD Client Secret>
SHAREPOINT_TENANT_ID=<Microsoft 365 Tenant ID>
SHAREPOINT_SITE_ID=<SharePoint Site ID>
SHAREPOINT_DRIVE_ID=<SharePoint Drive ID>
```
See `docs/ATTACHMENT_SETUP.md` for how to obtain each value, and `LOCAL_UPLOADS_GUIDE.md` for the local-storage default.

## Security Features

1. All attachment endpoints require a JWT
2. Only the uploader or an admin (`ADMIN`/`SUPER_ADMIN`) can delete an attachment
3. File validation on both frontend and backend: type whitelist (PDF, Word, Excel, PNG/JPEG/GIF, plain text, CSV), 50MB size limit
4. SharePoint client secret lives only in backend env vars, never sent to the frontend
5. Downloads go through an authenticated blob fetch, not a bare link — the browser never gets a URL that works without a valid session

## Known Limitations / Follow-ups

- **Download only works for local storage.** `getFileForDownload` throws for SharePoint-stored files; users must open those directly in SharePoint. Proxying/redirecting SharePoint downloads through the API is a reasonable next step if this becomes a pain point.
- No virus scanning, file preview, drag-and-drop, versioning, or per-project storage quotas — none of these were requested; call these out if they come up.

## Troubleshooting

### Backend won't start after pulling these changes
- Confirm `AttachmentsModule` is imported in `AppModule` and that it imports `AuthModule` (the controller's `JwtAuthGuard` needs `JwtService`, which only `AuthModule` provides)

### Upload succeeds but nothing shows up for the task/case
- Check whether the attachment was created with `commentId` set (comment-linked) vs `taskId`/`caseId` directly — `getAttachmentsByTask`/`getAttachmentsByCase` need to query **both** paths (`OR: [{ taskId }, { comment: { taskId } }]`), since a comment-linked row never carries `taskId` itself
- Check the backend log for a Postgres `23514` constraint violation — that means both a parent id and `commentId` were set on the same insert

### Download button/chip does nothing or errors
- Confirm the request is going through `AttachmentsService.downloadFile()` (an authenticated blob fetch), not a plain anchor `href` — a direct link has no bearer token and will 401 against the guarded route
- If SharePoint is configured, direct download isn't supported yet (see Known Limitations)
