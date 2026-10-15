import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, ViewChild, afterRenderEffect, inject } from '@angular/core';
import { ConfirmationRequest, ConfirmationService } from '../../services/confirmation.service';

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-dialog.component.html',
  styleUrl: './confirmation-dialog.component.scss',
})
export class ConfirmationDialogComponent implements OnDestroy {
  protected readonly confirmation = inject(ConfirmationService);
  private readonly document = inject(DOCUMENT);
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;
  @ViewChild('cancelButton') private cancelButton?: ElementRef<HTMLButtonElement>;
  private shownRequest: ConfirmationRequest | null = null;
  private previousFocus: HTMLElement | null = null;
  private previousOverflow = '';

  constructor() {
    afterRenderEffect(() => {
      const request = this.confirmation.active();
      if (request && request !== this.shownRequest) {
        this.shownRequest = request;
        this.previousFocus = this.document.activeElement as HTMLElement | null;
        this.previousOverflow = this.document.body.style.overflow;
        this.document.body.style.overflow = 'hidden';
        this.cancelButton?.nativeElement.focus();
      } else if (!request && this.shownRequest) {
        this.shownRequest = null;
        this.document.body.style.overflow = this.previousOverflow;
        const previousFocus = this.previousFocus;
        this.previousFocus = null;
        if (previousFocus?.isConnected) previousFocus.focus();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.shownRequest) this.document.body.style.overflow = this.previousOverflow;
    this.confirmation.respond(false);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.confirmation.active()) return;
    event.preventDefault();
    this.confirmation.respond(false);
  }

  @HostListener('document:keydown.tab', ['$event'])
  onTab(event: Event): void {
    if (!this.confirmation.active() || !this.dialog) return;
    const keyboardEvent = event as KeyboardEvent;
    const buttons = Array.from(this.dialog.nativeElement.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (keyboardEvent.shiftKey && this.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!keyboardEvent.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!this.dialog.nativeElement.contains(this.document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }

  @HostListener('document:focusin', ['$event'])
  onFocus(event: Event): void {
    if (!this.confirmation.active() || !this.dialog) return;
    if (!this.dialog.nativeElement.contains(event.target as Node)) {
      this.cancelButton?.nativeElement.focus();
    }
  }
}
