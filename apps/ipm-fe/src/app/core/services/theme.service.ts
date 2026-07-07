import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'ipm-fe.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly documentElement: HTMLElement;
  private mode: ThemeMode;

  constructor(@Inject(DOCUMENT) document: Document) {
    this.documentElement = document.documentElement;
    this.mode = this.readPreferredTheme();
    this.applyTheme(this.mode);
  }

  get currentMode(): ThemeMode {
    return this.mode;
  }

  get iconName(): 'dark_mode' | 'light_mode' {
    return this.mode === 'dark' ? 'light_mode' : 'dark_mode';
  }

  get buttonLabel(): string {
    return this.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }

  toggleTheme(): void {
    this.mode = this.mode === 'dark' ? 'light' : 'dark';
    this.applyTheme(this.mode);
    window.localStorage.setItem(THEME_STORAGE_KEY, this.mode);
  }

  private readPreferredTheme(): ThemeMode {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private applyTheme(mode: ThemeMode): void {
    this.documentElement.setAttribute('data-theme', mode);
    this.documentElement.style.colorScheme = mode;
  }
}