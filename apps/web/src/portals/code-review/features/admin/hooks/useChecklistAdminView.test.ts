import { beforeEach, describe, expect, it } from 'vitest';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';
import { CHECKLIST_VIEW_STORAGE_KEY, useChecklistAdminView } from './useChecklistAdminView.ts';

/**
 * What the admin has arranged but not saved, and how it survives.
 *
 * The store exists because Radix unmounts an inactive tab panel, so everything
 * here is really one question: does the arrangement outlive the component that
 * built it, and does it stop being trusted when it should?
 */

const read = () => useChecklistAdminView.getState();

beforeEach(() => {
  read().reset();
});

describe('useChecklistAdminView', () => {
  it('starts empty, on the questions tab, with both filters open', () => {
    expect(read().view).toBe('questions');
    expect(read().search).toBe('');
    expect(read().categoryFilter).toBe(ALL);
    expect(read().taskTypeFilter).toBe(ALL);
    expect(read().questionDrafts).toEqual({});
    expect(read().categoryDraft).toBeNull();
    expect(read().taskTypeDraft).toBeNull();
  });

  it('writes what it holds to sessionStorage, and no functions with it', () => {
    read().setView('taskTypes');
    read().setSearch('reservation');
    read().setTaskTypeDraft(['tt-lobby', 'tt-customization']);

    const written = window.sessionStorage.getItem(CHECKLIST_VIEW_STORAGE_KEY);
    expect(written).not.toBeNull();

    const { state } = JSON.parse(written ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(state['view']).toBe('taskTypes');
    expect(state['search']).toBe('reservation');
    expect(state['taskTypeDraft']).toEqual(['tt-lobby', 'tt-customization']);

    /*
     * `partialize` has to drop the actions.
     *
     * JSON turns a function into `null`, so persisting them writes a payload
     * that rehydrates over the real actions with nulls — the store comes back
     * looking populated and throws on the first call. Asserting the absence is
     * the only way this stays true.
     */
    expect(Object.values(state).some((value) => typeof value === 'function')).toBe(false);
    for (const action of ['setView', 'setSearch', 'reset']) {
      expect(state).not.toHaveProperty(action);
    }
  });

  it('takes an updater, so successive moves compose', () => {
    // The drag path: each drop builds on the arrangement before it, not on the
    // server's order. A plain value here would drop every move but the last.
    read().setCategoryDraft(['a', 'b', 'c']);
    read().setCategoryDraft((current) => [...(current ?? []), 'd']);

    expect(read().categoryDraft).toEqual(['a', 'b', 'c', 'd']);

    read().setQuestionDrafts({ 'cat-code': ['q-1'] });
    read().setQuestionDrafts((current) => ({
      ...current,
      'cat-reservation': ['q-2'],
    }));

    expect(read().questionDrafts).toEqual({
      'cat-code': ['q-1'],
      'cat-reservation': ['q-2'],
    });
  });

  it('falls back to the default tab for a value that matches no tab', () => {
    // `sessionStorage` is editable by hand and outlives a deploy that renames a
    // tab. Radix renders NO panel for a value it does not recognise, so an
    // unsanitised one leaves the admin looking at an empty screen.
    read().setView('nonsense');

    expect(read().view).toBe('questions');
  });

  it('empties every slice on reset', () => {
    read().setView('categories');
    read().setSearch('code');
    read().setCategoryFilter('cat-code');
    read().setTaskTypeFilter('tt-lobby');
    read().setQuestionDrafts({ 'cat-code': ['q-code-2', 'q-code-1'] });
    read().setCategoryDraft(['cat-code']);
    read().setTaskTypeDraft(['tt-lobby']);

    read().reset();

    // Sign-out calls this, so a slice it forgets is one the next person to use
    // this browser inherits.
    expect(read()).toMatchObject({
      view: 'questions',
      search: '',
      categoryFilter: ALL,
      taskTypeFilter: ALL,
      questionDrafts: {},
      categoryDraft: null,
      taskTypeDraft: null,
    });
  });
});
