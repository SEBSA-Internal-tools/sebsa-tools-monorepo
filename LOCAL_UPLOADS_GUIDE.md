# Local File Upload Guide

By default, attachment uploads are stored in a **local `/uploads` folder** that is NOT committed to Git.

## ✅ Default Behavior (No Configuration Needed)

When you upload a file:
1. File is saved to `/uploads/tasks/{taskId}/{fileName}`
2. File path is stored in database
3. Attachment appears immediately in the comment

**No SharePoint setup required!** 🎉

## 📁 Folder Structure

After uploading files, you'll see:
```
your-repo/
├── uploads/                          ← NOT in Git
│   └── tasks/
│       ├── 550e8400-e29b-41d4.../
│       │   ├── contract.pdf
│       │   ├── quote.xlsx
│       │   └── design.png
│       └── 6ba7b810-9dad-11d1.../
│           └── report.docx
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

Files are organized by task ID:

```
uploads/tasks/{taskId}/{fileName}
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
- [ ] Just upload files and they appear
- [ ] Files stored in `/uploads` (not in Git)
- [ ] Easy to test attachment features

When ready for SharePoint:
- [ ] Configure Azure AD
- [ ] Set environment variables
- [ ] Restart backend
- [ ] Done! Automatic switch

## ❓ FAQ

**Q: Where are uploaded files stored?**  
A: `/uploads/tasks/{taskId}/` in your local repo

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

No additional setup needed. Just use the attachment button in comments.
