import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { ConfirmationDialogComponent } from './confirmation-dialog.component';
import { ConfirmationService } from '../../services/confirmation.service';

describe('ConfirmationDialogComponent', () => {
  let navigation: Subject<NavigationStart>;
  const request = {
    title: 'Delete item',
    message: 'Delete this item?',
    consequence: 'It cannot be restored.',
    confirmLabel: 'Delete',
  };

  beforeEach(async () => {
    navigation = new Subject<NavigationStart>();
    await TestBed.configureTestingModule({
      imports: [ConfirmationDialogComponent],
      providers: [{ provide: Router, useValue: { events: navigation.asObservable() } }],
    }).compileComponents();
  });

  it('cancels without confirming and restores focus', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const fixture = TestBed.createComponent(ConfirmationDialogComponent);
    const host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    const confirmation = TestBed.inject(ConfirmationService);

    const result = confirmation.confirm(request);
    fixture.detectChanges();
    expect(host.querySelector('button')?.isConnected).toBe(true);
    await Promise.resolve();
    expect(document.activeElement?.textContent).toBe('Cancel');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(await result).toBe(false);
    await Promise.resolve();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
    fixture.destroy();
    host.remove();
    trigger.remove();
  });

  it('confirms only when the destructive button is clicked', async () => {
    const fixture = TestBed.createComponent(ConfirmationDialogComponent);
    fixture.detectChanges();
    const confirmation = TestBed.inject(ConfirmationService);
    const result = confirmation.confirm(request);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[1].click();
    fixture.detectChanges();
    expect(await result).toBe(true);
    fixture.destroy();
  });

  it('cancels a pending action when navigation starts', async () => {
    const fixture = TestBed.createComponent(ConfirmationDialogComponent);
    fixture.detectChanges();
    const confirmation = TestBed.inject(ConfirmationService);
    const result = confirmation.confirm(request);
    fixture.detectChanges();

    navigation.next(new NavigationStart(1, '/another-page'));
    fixture.detectChanges();
    expect(await result).toBe(false);
    fixture.destroy();
  });
});
