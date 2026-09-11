import type { Dispatch, SetStateAction } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';

/**
 * What the admin has arranged on Admin ▸ Quality Checklist but not yet saved.
 *
 * The three tabs are Radix panels, and Radix unmounts the inactive one — so a
 * minute of dragging on Categories vanished the moment the admin glanced at
 * Questions, with no prompt and nothing to undo. Component state cannot survive
 * that, nor a trip to another admin screen, nor a refresh.
 *
 * Modelled on `features/tasks/hooks/useTaskDraft.ts`, which solves the same
 * problem for the wizard, and for the same reasons:
 *
 * - **`sessionStorage`, not `localStorage`.** An abandoned arrangement should not
 *   reappear next week in a different tab looking like work in progress.
 * - **Key prefixed `sdp.`**, so `clearUserStorage()` sweeps it on sign-out
 *   without having to be told this store exists.
 * - **`partialize` drops the actions.** Persisting them serialises functions to
 *   `null` and the store comes back broken.
 *
 * It holds only what the admin has TYPED or ARRANGED. Every rule about that data
 * — how a move is applied, how a sequence is renumbered — stays in
 * `lib/checklistOrdering.ts`, so this remains a dumb container.
 */

const STORAGE_KEY = 'sdp.checklistAdminView';

export type ChecklistView = 'questions' | 'categories' | 'taskTypes';

const VIEWS: readonly string[] = ['questions', 'categories', 'taskTypes'];

/**
 * A persisted view value is only as trustworthy as `sessionStorage`.
 *
 * Radix renders no panel at all for a value that matches no tab, so a hand-edited
 * or stale key would leave the screen looking empty. Anything unrecognised falls
 * back to the default tab.
 */
function toView(value: string): ChecklistView {
  return VIEWS.includes(value) ? (value as ChecklistView) : 'questions';
}

export interface ChecklistAdminViewState {
  /** Which of the three tabs is open. Persisted with the drafts on purpose — see below. */
  view: ChecklistView;

  /* The Questions tab's toolbar. */
  search: string;
  categoryFilter: string;
  taskTypeFilter: string;

  /** Unsaved question order, per category: `{ [categoryId]: questionId[] }`. */
  questionDrafts: Record<string, string[]>;
  /** Unsaved category order — one flat sequence, or `null` for the server's. */
  categoryDraft: string[] | null;
  /** Unsaved task type order, same shape. */
  taskTypeDraft: string[] | null;

  setView: (view: string) => void;
  setSearch: (search: string) => void;
  setCategoryFilter: (categoryId: string) => void;
  setTaskTypeFilter: (taskTypeId: string) => void;

  /*
   * `Dispatch<SetStateAction<…>>`, the same signature `useState` returns.
   *
   * The panels held these in `useState` before and update them from an event
   * handler that must compose with the previous value ("move this row one more
   * place"). Keeping React's own signature means the panels read identically
   * whether the state is local or lives here, and the updater form stays
   * available — two drops in one tick would otherwise race a subscribed value
   * that has not re-rendered yet.
   */
  setQuestionDrafts: Dispatch<SetStateAction<Record<string, string[]>>>;
  setCategoryDraft: Dispatch<SetStateAction<string[] | null>>;
  setTaskTypeDraft: Dispatch<SetStateAction<string[] | null>>;

  reset: () => void;
}

const EMPTY = {
  view: 'questions',
  search: '',
  categoryFilter: ALL,
  taskTypeFilter: ALL,
  questionDrafts: {},
  categoryDraft: null,
  taskTypeDraft: null,
} satisfies Omit<
  ChecklistAdminViewState,
  | 'setView'
  | 'setSearch'
  | 'setCategoryFilter'
  | 'setTaskTypeFilter'
  | 'setQuestionDrafts'
  | 'setCategoryDraft'
  | 'setTaskTypeDraft'
  | 'reset'
>;

/** Applies a `useState`-style update against the value already in the store. */
function applied<T>(update: SetStateAction<T>, current: T): T {
  return typeof update === 'function' ? (update as (previous: T) => T)(current) : update;
}

export const useChecklistAdminView = create<ChecklistAdminViewState>()(
  persist(
    (set) => ({
      ...EMPTY,

      setView: (view) => {
        set({ view: toView(view) });
      },

      setSearch: (search) => {
        set({ search });
      },

      setCategoryFilter: (categoryFilter) => {
        set({ categoryFilter });
      },

      setTaskTypeFilter: (taskTypeFilter) => {
        set({ taskTypeFilter });
      },

      setQuestionDrafts: (update) => {
        set((state) => ({
          questionDrafts: applied(update, state.questionDrafts),
        }));
      },

      setCategoryDraft: (update) => {
        set((state) => ({
          categoryDraft: applied(update, state.categoryDraft),
        }));
      },

      setTaskTypeDraft: (update) => {
        set((state) => ({
          taskTypeDraft: applied(update, state.taskTypeDraft),
        }));
      },

      reset: () => {
        set(EMPTY);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        view: state.view,
        search: state.search,
        categoryFilter: state.categoryFilter,
        taskTypeFilter: state.taskTypeFilter,
        questionDrafts: state.questionDrafts,
        categoryDraft: state.categoryDraft,
        taskTypeDraft: state.taskTypeDraft,
      }),
    },
  ),
);

/** The storage key, exported so a test can assert sign-out removed it. */
export const CHECKLIST_VIEW_STORAGE_KEY = STORAGE_KEY;
