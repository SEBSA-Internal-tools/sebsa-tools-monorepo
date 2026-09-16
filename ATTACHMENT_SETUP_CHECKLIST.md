# Attachment Feature Setup Checklist

## ✅ Implementation Status

Code is complete and working for both **tasks and cases** using **local disk storage** by default — no setup required to try it out. SharePoint is an optional swap-in backend; follow the steps below only if you want files to land in SharePoint instead of `/uploads`.

## 🧪 Try It Now (no setup needed)

1. Backend running (`npx nx serve ipm-be`), frontend running (`npx nx serve ipm-fe` or `ng serve`)
2. Open a task or a case detail page
3. Scroll to the **Comments** section
4. Click the 📎 attach button in the comment composer, pick a file, then post the comment
5. The file appears as a small chip under your comment — click it to download
6. Scroll to the **Attachments** card in the sidebar (below Activity) to see every attachment for that task/case, with download and delete actions

That's it — files land in `/uploads/tasks/{taskId}/...` or `/uploads/cases/{caseId}/...`, which is git-ignored. See `LOCAL_UPLOADS_GUIDE.md` for details.

## 📋 Optional: Switch to SharePoint

### Step 1: Azure AD Configuration
- [ ] Go to [Azure Portal](https://portal.azure.com)
- [ ] Navigate to Azure Active Directory → App registrations
- [ ] Click "New registration"
- [ ] Name it: "IPM Tool - Attachments"
- [ ] Copy **Application (client) ID** → Save for `.env`
- [ ] Copy **Directory (tenant) ID** → Save for `.env`

### Step 2: Create Client Secret
- [ ] In app registration → Certificates & secrets
- [ ] Click "New client secret"
- [ ] Set expiration (e.g., 24 months)
- [ ] Copy the secret value immediately → Save for `.env` as `SHAREPOINT_CLIENT_SECRET`

### Step 3: Grant API Permissions
- [ ] In app registration → API permissions
- [ ] Click "Add a permission"
- [ ] Select "Microsoft Graph"
- [ ] Choose "Application permissions" (NOT Delegated)
- [ ] Search and add:
  - [ ] `Files.ReadWrite.All`
  - [ ] `Sites.ReadWrite.All`
- [ ] Click "Grant admin consent" (requires admin)

### Step 4: Get SharePoint IDs
Choose ONE method:

**Method A: Microsoft Graph Explorer (Easiest)**
- [ ] Go to [Microsoft Graph Explorer](https://developer.microsoft.com/graph/explorer)
- [ ] Sign in
- [ ] Run: `GET https://graph.microsoft.com/v1.0/sites/root`
- [ ] Copy the `id` field → `SHAREPOINT_SITE_ID`
- [ ] Run: `GET https://graph.microsoft.com/v1.0/sites/{siteId}/drives`
- [ ] Find default drive, copy `id` → `SHAREPOINT_DRIVE_ID`

**Method B: PowerShell**
```powershell
Connect-PnPOnline -Url "https://sebsaworld-my.sharepoint.com" -Interactive
$site = Get-PnPSite
$site.Id  # SHAREPOINT_SITE_ID
Get-PnPList -Identity "Documents" | Select Id  # SHAREPOINT_DRIVE_ID
```

### Step 5: Configure Environment Variables
- [ ] Open `.env` file
- [ ] Uncomment and fill in the SharePoint section:
```env
SHAREPOINT_CLIENT_ID=<your-app-id>
SHAREPOINT_CLIENT_SECRET=<your-client-secret>
SHAREPOINT_TENANT_ID=<your-tenant-id>
SHAREPOINT_SITE_ID=<your-site-id>
SHAREPOINT_DRIVE_ID=<your-drive-id>
```
- [ ] Save the file
- [ ] Restart the backend server (SharePoint vs. local storage is decided once, on startup, from whether `SHAREPOINT_CLIENT_ID` is set)

### Step 6: Test Upload Against SharePoint
- [ ] Attach a file to a comment on a task, post it
- [ ] Confirm it uploads without error
- [ ] Log into SharePoint, navigate to the configured library
- [ ] Verify `/tasks/{taskId}/` folder was created with your file
- [ ] Repeat on a case → verify `/cases/{caseId}/` folder

> ⚠️ **Known limitation:** the in-app download button/chip only works for locally-stored files. Once SharePoint is active, open uploaded files directly in SharePoint rather than via the app's download action (it will return an error explaining this).

## 🧪 Testing Scenarios (either storage backend)

### Basic Upload
- [ ] Attach a file while writing a comment, post it
- [ ] File chip appears under the comment
- [ ] File appears in the sidebar Attachments list

### Multiple Files
- [ ] Attach multiple files to one comment before posting
- [ ] All appear as separate chips under that comment
- [ ] All appear in the sidebar attachments list

### On a Case (not just a Task)
- [ ] Repeat the basic upload flow on a case detail page
- [ ] Confirm the sidebar Attachments card shows case attachments correctly

### File Type / Size Validation
- [ ] Try attaching a `.exe` file → rejected with a toast, before upload starts
- [ ] Try attaching a file > 50MB → rejected with a toast
- [ ] Try a supported type (PDF, Word, Excel, PNG/JPEG/GIF, txt, csv) → succeeds

### Permissions
- [ ] Upload a file as User A
- [ ] As User B, confirm there's no delete option for that attachment in the sidebar
- [ ] As User A (or an admin), confirm delete works

### Download
- [ ] Click a comment's attachment chip → file downloads
- [ ] Click the sidebar's download icon for the same file → downloads too
- [ ] Confirm no 401 in the network tab (this was a real bug: the original implementation used a plain `<a href>` which carries no auth token against the guarded download route — now fixed to fetch as an authenticated blob)

## 🐛 Troubleshooting

### "Nest can't resolve dependencies (JwtService)" on startup
**Cause:** `AttachmentsModule` didn't import `AuthModule`. **Fixed** — `AttachmentsModule` now imports both `PrismaModule` and `AuthModule`.

### `GET /api/attachments/task/:taskId` (or `/case/:caseId`) returns 404
**Cause:** usually a stale backend process still running old compiled code after a route was added. Restart the backend (`npx nx serve ipm-be`) — check `netstat -ano | grep :3000` first if unsure whether one is already running.

### Uploaded file doesn't show up anywhere, but no visible error
**Cause:** was a real bug — `uploadAttachment` used to set both `taskId` and `commentId` on the same row, which violates the DB's `attachments_exactly_one_parent` CHECK constraint and fails with Postgres error `23514`. **Fixed** — a comment-linked attachment now sets `commentId` only, and the listing queries join through the comment to find its task/case.

### Download does nothing / 401 in console
**Cause:** was a real bug — the download link used a plain `<a href>` with no auth header against a guarded route, and the backend didn't even have a download endpoint at first. **Fixed** — added `GET /api/attachments/download/:filePath` and switched the frontend to fetch it as an authenticated `Blob` via `HttpClient`.

### SharePoint upload fails with 404
- [ ] Verify `SHAREPOINT_SITE_ID` and `SHAREPOINT_DRIVE_ID` are correct
- [ ] Verify application has `Files.ReadWrite.All` permission
- [ ] Check Tenant ID is correct

### SharePoint upload fails with 403 (Access Denied)
- [ ] Verify client secret hasn't expired
- [ ] Re-authenticate with new secret if needed
- [ ] Verify admin consent was granted

### Attach button doesn't appear
- [ ] Clear browser cache / hard refresh
- [ ] Check browser console for JavaScript errors
- [ ] Confirm you're looking at the comment composer on a task or case detail page (not inside a reply box — replies don't have their own attach button, only the top-level composer does)

## 📚 Documentation

- **Local storage default:** `LOCAL_UPLOADS_GUIDE.md`
- **SharePoint setup guide:** `docs/ATTACHMENT_SETUP.md`
- **Full implementation details:** `ATTACHMENTS_IMPLEMENTATION.md`
- **This file:** setup + testing checklist

## ✨ Feature Highlights

- Files are attached **as part of composing a comment** — no separate upload flow to think about
- Works identically on **tasks and cases**
- Each comment shows a small chip for its own attachments; the full list per task/case lives in the sidebar
- Local storage by default, SharePoint by configuration — same code path either way
- Downloads are authenticated (no more silent 401s)
- Only the uploader or an admin can delete

---

**Status:** ✅ Working end-to-end on local storage. SharePoint is opt-in via `.env`.
