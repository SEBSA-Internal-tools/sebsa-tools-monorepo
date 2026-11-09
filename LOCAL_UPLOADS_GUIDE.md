# Local File Upload Guide

By default, attachment uploads are stored in a **local `/uploads` folder** that is NOT committed to Git.

## ✅ Default Behavior (No Configuration Needed)

Files are attached while composing a comment (or reply) on a task or case:
1. Pick files with the 📎 button in the comment composer
2. Post the comment — files upload right after the comment is created
3. File path is stored in the database, linked to that comment
4. The file shows up as a small chip under the comment, and in the entity's "Attachments" sidebar section

**No SharePoint setup required!** 🎉

## 📁 Folder Structure

After uploading files, you'll see:
```
your-repo/
├── uploads/                          ← NOT in Git
│   ├── tasks/
│   │   ├── 550e8400-e29b-41d4.../
│   │   │   ├── contract.pdf
│   │   │   ├── quote.xlsx
│   │   │   └── design.png
│   │   └── 6ba7b810-9dad-11d1.../
│   │       └── report.docx
│   └── cases/
│       └── 31bc5132-dd5f-4b18.../
│           └── proposal.pdf
├── .gitignore                        ← /uploads listed here
├── apps/
└── ...
```

The entire `/uploads` folder is in `.gitignore`, so it won't be committed.

## 🔄 Switching to SharePoint Later

When you're ready to use SharePoint:

1. Get your SharePoint credentials (see [ATTACHMENT_SETUP_CHECKLIST.md](ATTACHMENT_SETUP_CHECKLIST.md))
2. Uncomment the SharePoint variables in `.env`:
   ```env
   SHAREPOINT_CLIENT_ID=your-id
   SHAREPOINT_CLIENT_SECRET=your-secret
   SHAREPOINT_TENANT_ID=your-tenant
   SHAREPOINT_SITE_ID=your-site
   SHAREPOINT_DRIVE_ID=your-drive
   ```
3. Restart the backend
4. Future uploads go to SharePoint automatically
5. Old files remain in `/uploads` folder (can be deleted manually)

> **Note:** direct in-app download (the download button/chip) currently only works for locally-stored files. Files uploaded while SharePoint is active need to be opened from SharePoint directly — see [ATTACHMENT_SETUP_CHECKLIST.md](ATTACHMENT_SETUP_CHECKLIST.md) for details.

## 🧹 Cleaning Up

To delete the local uploads folder:
```bash
# Linux/Mac
rm -rf uploads/

# Windows
rmdir /s uploads
```

Or just delete it through your file explorer. The system will recreate it when needed.

## ℹ️ How It Works

The system automatically detects which storage to use:

```typescript
// If SHAREPOINT_CLIENT_ID is configured → use SharePoint
// Otherwise → use local storage
```

**No code changes needed!** Just configure environment variables.

## 🔍 Finding Your Files

Files are organized by the entity they're attached to:

```
uploads/tasks/{taskId}/{fileName}
uploads/cases/{caseId}/{fileName}
```

Example:
```
uploads/tasks/550e8400-e29b-41d4-a716-446655440000/budget.xlsx
```

You can browse directly in the `/uploads` folder to see all files.

## ⚠️ Development Notes

- **Local storage is perfect for development/testing**
- Files are persisted between server restarts
- Each developer gets their own `/uploads` folder
- Easy to clean up or reset

## 🚀 Production

For production, we strongly recommend:
- ✅ Use SharePoint (enterprise-grade storage)
- ✅ Configure proper backups
- ✅ Set retention policies
- ✅ Use versioning

## 📋 Checklist

For local development:
- [ ] No SharePoint setup needed
- [ ] Attach a file while writing a comment and post it
- [ ] Files stored in `/uploads` (not in Git)
- [ ] Easy to test attachment features

When ready for SharePoint:
- [ ] Configure Azure AD
- [ ] Set environment variables
- [ ] Restart backend
- [ ] Done! Automatic switch

## ❓ FAQ

**Q: Where are uploaded files stored?**
A: `/uploads/tasks/{taskId}/` or `/uploads/cases/{caseId}/` in your local repo

**Q: Are they committed to Git?**
A: No, `/uploads` is in `.gitignore`

**Q: Can multiple developers share uploads?**
A: No, each has their own `/uploads` folder (by design)

**Q: How do I migrate to SharePoint?**
A: Just configure env vars and restart - new uploads go to SharePoint

**Q: What about old local files when switching to SharePoint?**
A: They stay in `/uploads`. Delete if not needed.

**Q: Can I use both local and SharePoint?**
A: No, only one can be active. If SharePoint is configured, it's used.

---

**Status:** ✅ Ready to upload files locally!

No additional setup needed. Just attach a file while writing a comment on a task or case.
