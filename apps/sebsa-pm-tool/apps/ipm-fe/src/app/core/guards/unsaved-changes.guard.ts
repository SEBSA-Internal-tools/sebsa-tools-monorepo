import type { CanDeactivateFn } from '@angular/router';
export interface EditablePage {
  isDirty: () => boolean;
  isSaving: () => boolean;
}
export function canLeaveEditor(page: EditablePage): boolean {
  if (page.isSaving()) return false;
  return !page.isDirty() || window.confirm('You have unsaved changes. Leave this page and discard them?');
}
export const unsavedChangesGuard: CanDeactivateFn<EditablePage> = page => canLeaveEditor(page);
