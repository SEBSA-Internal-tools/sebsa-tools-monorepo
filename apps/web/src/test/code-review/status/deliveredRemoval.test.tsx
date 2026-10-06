import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { TASK_STATUSES } from '@sdp/contracts';
import { db, findReview, resetDb } from '@/mocks/db.ts';
import { MOCK_DATABASE_KEY, persistDatabase, restoreDatabase } from '@/mocks/persistence.ts';
import common from '@/content/common.json';
import { countText, renderApp, USERS } from '../fixtures/renderApp.tsx';

const FORMERLY_DELIVERED = 't-semco-007';
const SEMCO_DEVELOPER = 'u-udari';

// Same as adminReports.test.tsx: the lazy Reports route pulls in Recharts, whose cold
// transform can outlast a `findBy` budget under a full parallel run.
beforeAll(async () => {
  await import('@/portals/code-review/features/reports/routes/AdminReportsPage.tsx');
}, 60_000);

async function statusOptions(user: ReturnType<typeof renderApp>['user']): Promise<string[]> {
  await user.click(await screen.findByRole('combobox', { name: /^status$/i }));
  const options = (await screen.findAllByRole('option')).map((o) => o.textContent.trim());
  await user.keyboard('{Escape}');
  return options;
}

function approvedCount(tasks: typeof db.tasks): number {
  return tasks.filter((task) => task.status === 'Approved').length;
}

describe('seed and persisted data', () => {
  it('contains no Delivered task or event', () => {
    expect(db.tasks.filter((t) => (t.status as string) === 'Delivered')).toEqual([]);
    expect(db.events.filter((e) => (e.kind as string) === 'Delivered')).toEqual([]);
  });

  it('seeds the formerly Delivered task as Approved with its approving review', () => {
    const task = db.tasks.find((t) => t.id === FORMERLY_DELIVERED)!;
    expect(task.status).toBe('Approved');
    expect(findReview(task.id, task.reviewCycle)?.decision).toBe('Approved');
  });

  it('migrates a saved browser snapshot holding a Delivered task instead of discarding it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    persistDatabase(localStorage);
    const snapshot = JSON.parse(localStorage.getItem(MOCK_DATABASE_KEY)!) as typeof db;
    snapshot.tasks.find((t) => t.id === FORMERLY_DELIVERED)!.status = 'Delivered' as never;
    snapshot.events.push({
      ...snapshot.events[0]!,
      id: 'legacy-delivered',
      kind: 'Delivered' as never,
    });
    snapshot.customers[0]!.name = 'Renamed In Saved Session';
    localStorage.setItem(MOCK_DATABASE_KEY, JSON.stringify(snapshot));

    resetDb();
    restoreDatabase(localStorage);

    expect(warn).not.toHaveBeenCalled();
    expect(db.tasks.find((t) => t.id === FORMERLY_DELIVERED)?.status).toBe('Approved');
    expect(db.events.some((e) => e.id === 'legacy-delivered')).toBe(false);
    expect(db.customers[0]?.name).toBe('Renamed In Saved Session');
    warn.mockRestore();
  });
});

describe('status filters offer only Code Review statuses', () => {
  it('My Tasks lists every status and no Delivered', async () => {
    const { user } = renderApp('/crp/developer');
    const options = await statusOptions(user);
    expect(options.slice(1)).toEqual(TASK_STATUSES.map((s) => common.status[s]));
  });

  it('Admin Tasks lists every non-Draft status and no Delivered', async () => {
    const { user } = renderApp('/crp/admin', USERS.adminOnly);
    const options = await statusOptions(user);
    expect(options.slice(1)).toEqual(
      TASK_STATUSES.filter((s) => s !== 'Draft').map((s) => common.status[s]),
    );
  });

  it('Admin Reports offers no Delivered filter and shows four status count cards', async () => {
    const { user } = renderApp('/crp/admin/reports', USERS.adminOnly);
    const options = await statusOptions(user);
    expect(options).toHaveLength(TASK_STATUSES.length + 1);
    expect(options.some((o) => /deliver/i.test(o))).toBe(false);

    const page = await screen.findByRole('region', { name: 'Reports & Analytics' });
    const captions = [
      /^All review tasks$/,
      /approval rate$/,
      /^Pending revisions$/,
      /^Tasks cancelled$/,
    ];
    for (const caption of captions) {
      expect(await within(page).findByText(caption)).toBeInTheDocument();
    }
    expect(within(page).queryByText(/of which delivered/i)).not.toBeInTheDocument();
  });
});

describe('approved counts agree across roles', () => {
  it('counts the formerly Delivered task as Approved for its developer and for Admin', async () => {
    const own = db.tasks.filter((t) => t.developerId === SEMCO_DEVELOPER);
    const first = renderApp('/crp/developer', SEMCO_DEVELOPER);
    const devCard = await screen.findByRole('button', { name: /show only approved/i });
    expect(devCard).toHaveTextContent(countText(approvedCount(own)));
    first.unmount();

    renderApp('/crp/admin', USERS.adminOnly);
    const adminCard = await screen.findByRole('button', { name: /show only approved/i });
    expect(adminCard).toHaveTextContent(countText(approvedCount(db.tasks)));
  });
});
