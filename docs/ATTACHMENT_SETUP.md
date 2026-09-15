# SharePoint Attachment Upload Setup Guide

This document explains how to configure and use the attachment upload feature that integrates with SharePoint.

## Overview

The attachment feature allows users to upload files to task comments, which are then stored in SharePoint under task-specific folders. The folder structure is automatically organized as:
```
/tasks/{taskId}/{fileName}
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

Update your `.env` file with the values collected:

```env
SHAREPOINT_CLIENT_ID=your-app-client-id
SHAREPOINT_CLIENT_SECRET=your-app-client-secret
SHAREPOINT_TENANT_ID=your-tenant-id
SHAREPOINT_SITE_ID=your-site-id
SHAREPOINT_DRIVE_ID=your-drive-id
```

## Step 7: Verify the Backend Module is Imported

Make sure the `AttachmentsModule` is imported in your main application module (`app.module.ts`):

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
3. Navigate to a task in the application
4. Scroll to the Comments section
5. Click the **Attach file** button (📎 icon)
6. Select a file (PDF, Word, Excel, Images, Text, CSV - max 50MB)
7. The file should upload and appear in the Attachments section

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
- Check the folder structure in SharePoint - it should exist under `/tasks/{taskId}/`
- Verify the application's folder creation permissions

### Upload button doesn't appear
- Ensure `FileUploadComponent` is imported in `CommentSectionComponent`
- Check browser console for any JavaScript errors
- Verify the task ID is being passed correctly

## Folder Structure in SharePoint

After uploading files, you'll see a structure like:
```
📁 Attachments Root
  ├── 📁 tasks
  │   ├── 📁 {task-id-1}
  │   │   ├── document1.pdf
  │   │   ├── image.jpg
  │   │   └── spreadsheet.xlsx
  │   ├── 📁 {task-id-2}
  │   │   └── report.docx
```

## Security Considerations

1. **Client Secret**: Store securely in `.env` - never commit to version control
2. **Permissions**: Use the principle of least privilege - only grant required permissions
3. **File Validation**: The frontend validates file type and size; the backend also validates
4. **Access Control**: Only the uploader or admins can delete attachments

## API Reference

### Upload File
```
POST /api/attachments/upload
Query Parameters:
  - taskId (required, UUID)
  - commentId (optional, UUID)
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
- Frontend: `apps/ipm-fe/src/app/core/components/file-upload/file-upload.component.ts`
- Backend: `apps/ipm-be/src/app/attachments/attachments.controller.ts`

## Database Schema

Attachments are stored in the `attachments` table with the following structure:
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

## Common Issues and Solutions

### Issue: "File type not allowed"
**Solution**: The frontend restricts file types. Modify the `ALLOWED_TYPES` array in `FileUploadComponent` if you need to support additional types.

### Issue: SharePoint folder not created automatically
**Solution**: The service attempts to create folders automatically. If this fails, manually create the `/tasks/` folder in SharePoint before uploading.

### Issue: Cannot delete attachment
**Solution**: Only the uploader or admins can delete attachments. Make sure you're logged in as the original uploader or an admin.

## Future Enhancements

- [ ] Add virus scanning before storing files
- [ ] Implement file versioning
- [ ] Add preview functionality for images and PDFs
- [ ] Support drag-and-drop upload
- [ ] Batch upload multiple files
- [ ] Add file expiration/retention policies
