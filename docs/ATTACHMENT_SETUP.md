# SharePoint Attachment Upload Setup Guide

This document explains how to configure the **optional** SharePoint backend for the attachment upload feature. By default, no configuration is required — attachments are stored on local disk (see [`LOCAL_UPLOADS_GUIDE.md`](../LOCAL_UPLOADS_GUIDE.md)). Follow this guide only if you want uploads to go to SharePoint instead.

## Overview

Users attach files while composing a comment on a task or a case (see [`ATTACHMENTS_IMPLEMENTATION.md`](../ATTACHMENTS_IMPLEMENTATION.md) for the full design). Once `SHAREPOINT_CLIENT_ID` is set, uploads switch from local disk to SharePoint, stored under entity-specific folders:
```
/tasks/{taskId}/{fileName}
/cases/{caseId}/{fileName}
```

## Prerequisites

- Azure AD tenant with appropriate permissions
- Access to SharePoint Online
- Admin permissions to register an application in Azure AD

## Step 1: Register an Application in Azure AD

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Fill in the details:
   - **Name**: "IPM Tool - Attachments" (or similar)
   - **Supported account types**: "Accounts in this organizational directory only"
   - Leave **Redirect URI** blank for now
5. Click **Register**

## Step 2: Create a Client Secret

1. In the app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Set an expiration (e.g., 24 months)
4. Click **Add** and copy the secret value immediately (you won't see it again)
5. Save this value - you'll need it for the `SHAREPOINT_CLIENT_SECRET` environment variable

## Step 3: Get Application Credentials

In the app registration overview page, copy:
- **Application (client) ID** → `SHAREPOINT_CLIENT_ID`
- **Directory (tenant) ID** → `SHAREPOINT_TENANT_ID`

## Step 4: Grant SharePoint Permissions

1. In the app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Application permissions** (not Delegated)
5. Search for and add these permissions:
   - `Files.ReadWrite.All`
   - `Sites.ReadWrite.All`
6. Click **Grant admin consent** (requires admin)

## Step 5: Get SharePoint Site Information

You need to find your SharePoint Site ID and Drive ID.

### Option A: Using Microsoft Graph Explorer

1. Go to [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/explorer)
2. Sign in with your Microsoft account
3. Run: `GET https://graph.microsoft.com/v1.0/sites/root`
4. In the response, find the `id` field - this is your `SHAREPOINT_SITE_ID`

For the Drive ID:
1. Run: `GET https://graph.microsoft.com/v1.0/sites/{siteId}/drives`
2. Find the drive you want to use (usually the default document library)
3. Copy its `id` - this is your `SHAREPOINT_DRIVE_ID`

### Option B: Using PowerShell

```powershell
# Connect to SharePoint
Connect-PnPOnline -Url "https://sebsaworld-my.sharepoint.com" -Interactive

# Get the site ID
$site = Get-PnPSite
$site.Id

# Get the drive ID
$drive = Get-PnPList -Identity "Documents"
$drive.Id
```

## Step 6: Configure Environment Variables

Update your `.env` file with the values collected (they're commented out by default in `.env.example`):

```env
SHAREPOINT_CLIENT_ID=your-app-client-id
SHAREPOINT_CLIENT_SECRET=your-app-client-secret
SHAREPOINT_TENANT_ID=your-tenant-id
SHAREPOINT_SITE_ID=your-site-id
SHAREPOINT_DRIVE_ID=your-drive-id
```

`AttachmentsService` checks for `SHAREPOINT_CLIENT_ID` on startup: if it's set, every upload goes through `SharePointService`; if not, it uses `LocalStorageService`. Restart the backend after changing this.

## Step 7: Verify the Backend Module is Imported

Make sure the `AttachmentsModule` is imported in your main application module (`app.module.ts`), and that `AttachmentsModule` itself imports `AuthModule` (its controller's `JwtAuthGuard` depends on `JwtService`, which only `AuthModule` provides):

```typescript
import { AttachmentsModule } from './attachments/attachments.module';

@Module({
  imports: [
    // ... other imports
    AttachmentsModule,
  ],
})
export class AppModule {}
```

## Testing the Feature

1. Start the backend server
2. Start the frontend development server
3. Navigate to a task or a case in the application
4. Scroll to the **Comments** section
5. Click the 📎 **attach** button in the comment composer and pick a file (PDF, Word, Excel, Images, Text, CSV - max 50MB)
6. Post the comment — the file uploads right after the comment is created
7. The file shows as a small chip under your comment, and in the "Attachments" card in the sidebar

## Troubleshooting

### "Failed to get SharePoint access token"
- Verify all environment variables are correct
- Check that the client secret hasn't expired
- Ensure the application has the required permissions in Azure AD

### "Failed to upload file to SharePoint"
- Verify the Site ID and Drive ID are correct
- Check that the application has `Files.ReadWrite.All` permission
- Ensure the user has access to the SharePoint folder

### File appears in database but not in SharePoint
- Check the folder structure in SharePoint - it should exist under `/tasks/{taskId}/` or `/cases/{caseId}/`
- Verify the application's folder creation permissions

### Attach button doesn't appear
- Check browser console for any JavaScript errors
- Verify the task/case ID is being passed correctly to `CommentSectionComponent`'s `targetId` input

### Downloading a SharePoint-stored file fails
- This is a known limitation, not a bug: the app's in-app download endpoint only serves locally-stored files. Files uploaded while SharePoint is active must be opened directly in SharePoint. See "Known Limitations" in `ATTACHMENTS_IMPLEMENTATION.md`.

## Folder Structure in SharePoint

After uploading files, you'll see a structure like:
```
📁 Attachments Root
  ├── 📁 tasks
  │   ├── 📁 {task-id-1}
  │   │   ├── document1.pdf
  │   │   ├── image.jpg
  │   │   └── spreadsheet.xlsx
  │   └── 📁 {task-id-2}
  │       └── report.docx
  └── 📁 cases
      └── 📁 {case-id-1}
          └── proposal.pdf
```

## Security Considerations

1. **Client Secret**: Store securely in `.env` - never commit to version control
2. **Permissions**: Use the principle of least privilege - only grant required permissions
3. **File Validation**: The frontend validates file type and size; the backend also validates
4. **Access Control**: Only the uploader or admins can delete attachments
5. **Downloads are authenticated**: the download route requires a JWT — the frontend fetches it as a `Blob` through `HttpClient` (not a plain link) so the bearer token is attached

## API Reference

### Upload File
```
POST /api/attachments/upload
Query Parameters:
  - taskId OR caseId (required, exactly one, UUID)
  - commentId (optional, UUID — set when the file is attached to a specific comment)
Body: multipart/form-data with 'file' field
Response: {
  id: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  filePath: string,
  uploadedBy: { id: string, name: string },
  createdAt: string
}
```

### List Attachments
```
GET /api/attachments/task/:taskId
GET /api/attachments/case/:caseId
Response: UploadAttachmentResponse[]
```

### Download File
```
GET /api/attachments/download/:filePath   (filePath URL-encoded)
Response: raw file bytes with Content-Disposition: attachment
```

### Delete Attachment
```
DELETE /api/attachments/:attachmentId
Response: { message: string }
```

## File Size and Type Limits

- **Max Size**: 50 MB
- **Allowed Types**:
  - PDF (`application/pdf`)
  - Word (`.doc`, `.docx`)
  - Excel (`.xls`, `.xlsx`)
  - Images (`.png`, `.jpg`, `.jpeg`, `.gif`)
  - Text (`.txt`, `.csv`)

To modify these limits, edit:
- Frontend: `apps/ipm-fe/src/app/core/components/comment-section/comment-section.component.ts` (`onFileSelected`, `isAllowedFileType`)
- Backend: `apps/ipm-be/src/app/attachments/attachments.controller.ts` (`FileInterceptor` limits)

## Database Schema

Attachments are stored in the `attachments` table:
```sql
CREATE TABLE attachments (
  id UUID PRIMARY KEY,
  taskId UUID,
  caseId UUID,
  commentId UUID,
  fileName VARCHAR(255),
  filePath VARCHAR(500),
  fileSize INTEGER,
  mimeType VARCHAR(100),
  uploadedById UUID,
  createdAt TIMESTAMP,

  -- CHECK constraint ensures exactly one of taskId/caseId/commentId is set
  FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (caseId) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (commentId) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (uploadedById) REFERENCES users(id) ON DELETE RESTRICT
);
```

**Important:** the exactly-one-parent constraint means a comment-attached file's row has `commentId` set and `taskId`/`caseId` left `NULL` — it is *not* also tagged with the task/case directly. To list "all attachments for task X", the backend queries `WHERE taskId = X OR comment.taskId = X`, joining through the comment relation. An earlier version of this feature set both fields together and every comment upload failed with a Postgres `23514` constraint violation — worth knowing if you're extending this code.

## Common Issues and Solutions

### Issue: "File type not allowed"
**Solution**: The frontend restricts file types. Modify `isAllowedFileType()` in `CommentSectionComponent` if you need to support additional types.

### Issue: SharePoint folder not created automatically
**Solution**: The service attempts to create folders automatically. If this fails, manually create the `/tasks/` or `/cases/` folder in SharePoint before uploading.

### Issue: Cannot delete attachment
**Solution**: Only the uploader or admins can delete attachments. Make sure you're logged in as the original uploader or an admin.

## Future Enhancements

- [ ] Add virus scanning before storing files
- [ ] Implement file versioning
- [ ] Add preview functionality for images and PDFs
- [ ] Support drag-and-drop upload
- [ ] Proxy/redirect downloads for SharePoint-stored files (currently local-storage only)
- [ ] Add file expiration/retention policies
