import { canLeaveEditor } from './unsaved-changes.guard';
describe('editor navigation protection', () => {
  afterEach(() => jest.restoreAllMocks());
  it('lets a clean editor leave without prompting', () => {
    const confirm = jest.spyOn(window, 'confirm');
    expect(canLeaveEditor({ isDirty: () => false, isSaving: () => false })).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('keeps dirty edits when the user cancels', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    expect(canLeaveEditor({ isDirty: () => true, isSaving: () => false })).toBe(false);
  });
  it('allows intentional discard', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    expect(canLeaveEditor({ isDirty: () => true, isSaving: () => false })).toBe(true);
  });
  it('keeps the editor open while saving', () => {
    expect(canLeaveEditor({ isDirty: () => false, isSaving: () => true })).toBe(false);
  });
});
