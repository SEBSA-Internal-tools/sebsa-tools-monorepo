# Attachment Feature Setup Checklist

## ✅ Implementation Complete

All code has been written and integrated. The backend is running successfully.

## 📋 Required Setup Steps

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
- [ ] Add or update SharePoint section:
```env
SHAREPOINT_CLIENT_ID=<your-app-id>
SHAREPOINT_CLIENT_SECRET=<your-client-secret>
SHAREPOINT_TENANT_ID=<your-tenant-id>
SHAREPOINT_SITE_ID=<your-site-id>
SHAREPOINT_DRIVE_ID=<your-drive-id>
```
- [ ] Save the file
- [ ] Restart the backend server

### Step 6: Verify Setup
- [ ] Backend is running (already confirmed ✅)
- [ ] Frontend is running (if not: `ng serve` in `apps/ipm-fe`)
- [ ] Open browser to http://localhost:4200
- [ ] Navigate to any task
- [ ] Scroll to Comments section
- [ ] Look for **attachment icon (📎)** button

### Step 7: Test Upload
- [ ] Click attachment button
- [ ] Select a file (PDF, Word, Excel, Image, Text, or CSV)
- [ ] Wait for upload to complete
- [ ] Verify file appears in "Attachments:" section below comment
- [ ] Log into SharePoint
- [ ] Navigate to the configured library
- [ ] Verify `/tasks/{taskId}/` folder was created with your file

## 🧪 Testing Scenarios

### Basic Upload
- [ ] Upload a PDF file
- [ ] Verify it appears in comments section
- [ ] Check SharePoint folder

### Multiple Files
- [ ] Upload multiple files to same task
- [ ] Verify all appear in attachments list
- [ ] Check file sizes are correct

### File Type Validation
- [ ] Try uploading .exe file → Should show error
- [ ] Try uploading file > 50MB → Should show error
- [ ] Try uploading supported type → Should succeed

### Permissions
- [ ] Upload file as User A
- [ ] Try to delete as User B → Should not have delete button
- [ ] Try to delete as User A → Should work
- [ ] Try to delete as Admin → Should work

### Error Handling
- [ ] Disable SHAREPOINT_CLIENT_ID temporarily
- [ ] Try to upload → Should show clear error
- [ ] Re-enable and verify recovery

## 🐛 Troubleshooting

### "Cannot find module" errors in build
**Solution:** All TypeScript errors fixed. Rebuild with `npx nx serve ipm-be`

### "Nest can't resolve dependencies" error
**Solution:** Already fixed by importing `AuthModule` in `AttachmentsModule`

### SharePoint upload fails with 404
- [ ] Verify `SHAREPOINT_SITE_ID` and `SHAREPOINT_DRIVE_ID` are correct
- [ ] Verify application has `Files.ReadWrite.All` permission
- [ ] Check Tenant ID is correct

### SharePoint upload fails with 403 (Access Denied)
- [ ] Verify client secret hasn't expired
- [ ] Re-authenticate with new secret if needed
- [ ] Verify admin consent was granted

### Files don't appear in SharePoint
- [ ] Log into SharePoint directly
- [ ] Check `/tasks/` folder exists
- [ ] Verify your application account has write access
- [ ] Check SharePoint recycle bin if files disappeared

### Attachment button doesn't appear
- [ ] Clear browser cache
- [ ] Refresh the page
- [ ] Check browser console for JavaScript errors
- [ ] Verify you're on a task detail page

## 📚 Documentation

- **Complete Setup Guide:** `docs/ATTACHMENT_SETUP.md`
- **Implementation Details:** `ATTACHMENTS_IMPLEMENTATION.md`
- **Feature Summary:** This file

## 🚀 What's Working Now

✅ Backend is running  
✅ File upload endpoint ready  
✅ Attachment deletion endpoint ready  
✅ Comment section UI updated  
✅ Database schema in place  

## ⏭️ What You Need To Do

1. Configure Azure AD (Step 1-3)
2. Get SharePoint IDs (Step 4)
3. Update `.env` file (Step 5)
4. Restart backend
5. Test file upload (Step 7)

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review `docs/ATTACHMENT_SETUP.md` for detailed instructions
3. Check browser console for client-side errors
4. Check backend logs for server-side errors
5. Verify all environment variables are set correctly

## ✨ Feature Highlights

- **Automatic Organization:** Files grouped by task ID in SharePoint
- **Smart Permissions:** Only uploaders or admins can delete
- **Safe Upload:** File type and size validation
- **User Feedback:** Progress bars and error messages
- **Responsive Design:** Works on desktop and tablet

---

**Status:** ✅ Ready for configuration and testing
