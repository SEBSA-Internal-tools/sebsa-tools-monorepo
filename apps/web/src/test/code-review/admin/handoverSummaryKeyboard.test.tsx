import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { db } from '@/mocks/db.ts';
import { renderApp, USERS } from '../fixtures/renderApp.tsx';

const HANDOVER_ID = 'HND-20260920-K9D1';

/** The metadata tile whose caption is `label`. */
async function tile(label: string): Promise<HTMLElement> {
  const caption = await screen.findByText(label, { selector: 'span' });
  return caption.parentElement!;
}

describe('admin handover summary — truncated values are keyboard-reachable', () => {
  it.each([
    ['Previous Reviewer', () => db.handovers.find((h) => h.id === HANDOVER_ID)!.fromReviewerName],
    ['Handover ID', () => HANDOVER_ID],
  ])('%s can be focused with Tab and reveals its full value', async (label, expected) => {
    const { user } = renderApp(`/crp/admin/handovers/${HANDOVER_ID}`, USERS.adminOnly);
    const trigger = within(await tile(label)).getByRole('button');
    expect(trigger).toHaveTextContent(expected());

    // Tab from the trigger's predecessor rather than calling focus(): proves it is in the tab order.
    trigger.blur();
    await user.tab();
    while (document.activeElement !== trigger && document.activeElement !== document.body) {
      await user.tab();
    }
    expect(trigger).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(expected());
  });

  it('makes the handed-over timestamp focusable too', async () => {
    renderApp(`/crp/admin/handovers/${HANDOVER_ID}`, USERS.adminOnly);
    const trigger = within(await tile('Handed Over')).getByRole('button');
    expect(trigger).not.toHaveAttribute('tabindex', '-1');
    expect(trigger).toHaveAttribute('type', 'button');
  });
});
