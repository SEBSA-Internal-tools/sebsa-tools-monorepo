# Assign User Modal — Quick Start Guide

## Basic Usage

### Import the Component
```typescript
import { AssignUserModalComponent } from './components/modals/assign-user/assign-user-modal.component';

@Component({
  imports: [AssignUserModalComponent],
})
export class YourComponent {
  // ...
}
```

### Add to Template
```html
<button (click)="openModal()">Add User</button>

<assign-user-modal
  [isOpen]="isModalOpen()"
  [projectId]="projectId"
  (close)="closeModal()"
  (submit)="handleAssign($event)"
></assign-user-modal>
```

### Component Logic
```typescript
import { signal } from '@angular/core';
import { AssignUserFormData } from './components/modals/assign-user/assign-user-modal.component';

export class YourComponent {
  isModalOpen = signal(false);
  projectId = 'project-123';

  openModal(): void {
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  handleAssign(formData: AssignUserFormData): void {
    console.log('Users to assign:', formData.users);
    // Call your API to save assignments
    // this.userService.assignUsersToProject(this.projectId, formData.users)
    //   .subscribe(() => {
    //     this.closeModal();
    //     this.loadTeamMembers(); // Refresh list
    //   });
  }
}
```

## Mock Test Data

Test the modal with these pre-loaded emails:

- `sarah.miller@sebsa.com` — Sarah Miller, Project Manager
- `james.chen@sebsa.com` — James Chen, Lead Developer
- `emma.rodriguez@sebsa.com` — Emma Rodriguez, QA Engineer
- `david.kim@sebsa.com` — David Kim, Backend Developer
- `lisa.anderson@sebsa.com` — Lisa Anderson, UI/UX Designer
- `michael.brown@sebsa.com` — Michael Brown, DevOps Engineer

## API Integration (Replace Mock)

### Current: Mock Database
```typescript
private mockUserDatabase: Record<string, AssignedUser> = {
  'sarah.miller@sebsa.com': { ... }
};
```

### Future: Real Backend

1. **Inject HttpClient:**
```typescript
constructor(private http: HttpClient) { }
```

2. **Replace setTimeout with API call:**
```typescript
// In onAddUser() method
this.http.get<AssignedUser>(`/api/users/by-email/${email}`)
  .subscribe({
    next: (user) => {
      if (this.selectedUsers().some(u => u.id === user.id)) {
        this.errorMessage.set('User already added');
        return;
      }
      this.selectedUsers.update(users => [...users, user]);
      this.emailInput = '';
      this.successMessage.set(`${user.name} added successfully`);
    },
    error: () => {
      this.errorMessage.set('User not found');
    },
    complete: () => this.isLoading.set(false)
  });
```

## Customization

### Change Success Color
In `assign-user-modal.component.scss`:
```scss
.btn-assign {
  background: #your-color-here; // Replace #10b981
}
```

### Change Modal Width
In `assign-user-modal.component.scss`:
```scss
.modal-container {
  max-width: 700px; // Change from 650px
}
```

### Add Custom Validation
In `assign-user-modal.component.ts`:
```typescript
onAddUser(): void {
  const email = this.emailInput.trim().toLowerCase();
  
  // Your custom validation
  if (email.includes('@company.com') === false) {
    this.errorMessage.set('Only company emails allowed');
    return;
  }
  
  // ... rest of logic
}
```

## Common Use Cases

### Example 1: Limit Users Per Project
```typescript
handleAssign(formData: AssignUserFormData): void {
  const maxUsers = 10;
  if (formData.users.length > maxUsers) {
    alert(`Maximum ${maxUsers} users allowed`);
    return;
  }
  // Proceed with assignment
}
```

### Example 2: Show Already Assigned Users
```typescript
// Pass as input to modal
@Input() existingUsers: string[] = []; // Array of user IDs
```

In template:
```html
<assign-user-modal 
  [existingUsers]="teamMemberIds"
  ...
></assign-user-modal>
```

### Example 3: Different User Sources
```typescript
// Option to search different backends
selectedBackend = 'internal'; // or 'external', 'contractors', etc.

async onAddUser() {
  const user = await this.getUserFromBackend(
    this.emailInput,
    this.selectedBackend
  );
}
```

## Troubleshooting

### Issue: Component not imported
**Error:** `NG1010: 'imports' must be an array of components...`

**Solution:** Add to component's imports array:
```typescript
imports: [AssignUserModalComponent]
```

### Issue: Email lookup always fails
**Check:**
1. Email format is correct (lowercase @ symbol)
2. Email exists in mock database (see "Mock Test Data" above)
3. Check browser console for errors

### Issue: Modal doesn't close
**Check:**
```typescript
// Make sure you're calling:
this.isModalOpen.set(false);
// Not:
this.isModalOpen = false; // Wrong! Not a signal
```

### Issue: Selected users not updating
**Use `.update()` method on signals:**
```typescript
// Correct
this.selectedUsers.update(users => [...users, newUser]);

// Wrong
this.selectedUsers.push(newUser); // Signals aren't arrays
```

## Performance Tips

1. **Use OnPush Detection:** Component already uses it ✅
2. **Track by ID:** Modal uses `track member.id` ✅
3. **Lazy Load:** Only renders when `isOpen = true` ✅
4. **Debounce API:** Currently 800ms delay (tune as needed)

## Keyboard Shortcuts

- **Enter Key:** Submit email (same as clicking Add)
- **Tab:** Navigate between form elements
- **Escape:** Currently not bound (use × or backdrop)

## Browser DevTools Tips

### Check Signal Values
```javascript
// In browser console
$0.component.selectedUsers() // View selected users
$0.component.isLoading() // Check loading state
```

### Debug Form State
```javascript
console.log($0.component.emailInput)
console.log($0.component.errorMessage())
```

## Related Documentation

- Full component docs: [ASSIGN_USER_MODAL.md](./ASSIGN_USER_MODAL.md)
- Session summary: [../../ASSIGN_USER_MODAL_SESSION.md](../../ASSIGN_USER_MODAL_SESSION.md)
- Parent component: [ProjectTeamComponent](../../../pages/project-detail/components/team/project-team.component.ts)

## Support

For issues, feature requests, or improvements:
1. Check existing documentation
2. Review mock data examples
3. Test with provided sample emails
4. Check Angular version compatibility (17+)

---

**Last Updated:** 2026-07-22  
**Version:** 1.0.0  
**Status:** Production Ready
