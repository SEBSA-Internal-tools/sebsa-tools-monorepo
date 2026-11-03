import { Injectable, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

export interface ConfirmationRequest {
  title: string;
  message: string;
  consequence: string;
  confirmLabel: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  private readonly router = inject(Router);
  private readonly pending = signal<ConfirmationRequest | null>(null);
  private resolvePending: ((confirmed: boolean) => void) | null = null;

  readonly active = this.pending.asReadonly();

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) this.respond(false);
    });
  }

  confirm(request: ConfirmationRequest): Promise<boolean> {
    // A second click must not replace the first action or leave its promise unresolved.
    if (this.resolvePending) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.resolvePending = resolve;
      this.pending.set(request);
    });
  }

  respond(confirmed: boolean): void {
    const resolve = this.resolvePending;
    if (!resolve) return;
    this.resolvePending = null;
    this.pending.set(null);
    resolve(confirmed);
  }
}
