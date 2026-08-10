import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

export type AccentMode = 'pink' | 'blue' | 'emerald' | 'amber' | 'violet';

export interface AccentOption {
  mode: AccentMode;
  label: string;
  color: string;
  strongColor: string;
  softColor: string;
  shadowColor: string;
}

const THEME_STORAGE_KEY = 'ipm-fe.theme';
const ACCENT_STORAGE_KEY = 'ipm-fe.accent';

const ACCENT_OPTIONS: AccentOption[] = [
  { mode: 'pink', label: 'Pink', color: '#d92561', strongColor: '#de2e6a', softColor: 'rgba(217, 37, 97, 0.1)', shadowColor: 'rgba(217, 37, 97, 0.22)' },
  { mode: 'blue', label: 'Blue', color: '#2563eb', strongColor: '#3b82f6', softColor: 'rgba(37, 99, 235, 0.12)', shadowColor: 'rgba(37, 99, 235, 0.22)' },
  { mode: 'emerald', label: 'Emerald', color: '#059669', strongColor: '#10b981', softColor: 'rgba(5, 150, 105, 0.12)', shadowColor: 'rgba(5, 150, 105, 0.22)' },
  { mode: 'amber', label: 'Amber', color: '#d97706', strongColor: '#f59e0b', softColor: 'rgba(217, 119, 6, 0.12)', shadowColor: 'rgba(217, 119, 6, 0.22)' },
  { mode: 'violet', label: 'Violet', color: '#7c3aed', strongColor: '#8b5cf6', softColor: 'rgba(124, 58, 237, 0.12)', shadowColor: 'rgba(124, 58, 237, 0.22)' },
];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly documentElement = inject(DOCUMENT).documentElement;
  private mode: ThemeMode;
  private accent: AccentOption;

  constructor() {
    this.mode = this.readPreferredTheme();
    this.accent = this.readPreferredAccent();
    this.applyTheme(this.mode);
    this.applyAccent(this.accent);
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

  get accentOptions(): AccentOption[] {
    return ACCENT_OPTIONS;
  }

  get currentAccent(): AccentOption {
    return this.accent;
  }

  get accentLabel(): string {
    return `Accent color: ${this.accent.label}`;
  }

  toggleTheme(): void {
    this.mode = this.mode === 'dark' ? 'light' : 'dark';
    this.applyTheme(this.mode);
    window.localStorage.setItem(THEME_STORAGE_KEY, this.mode);
  }

  setAccent(mode: AccentMode): void {
    const selectedAccent = ACCENT_OPTIONS.find((option) => option.mode === mode);

    if (!selectedAccent) {
      return;
    }

    this.accent = selectedAccent;
    this.applyAccent(selectedAccent);
    window.localStorage.setItem(ACCENT_STORAGE_KEY, selectedAccent.mode);
  }

  private readPreferredTheme(): ThemeMode {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private readPreferredAccent(): AccentOption {
    const storedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY) as AccentMode | null;

    return ACCENT_OPTIONS.find((option) => option.mode === storedAccent) ?? ACCENT_OPTIONS[0];
  }

  private applyTheme(mode: ThemeMode): void {
    this.documentElement.setAttribute('data-theme', mode);
    this.documentElement.style.colorScheme = mode;
  }

  private applyAccent(accent: AccentOption): void {
    this.documentElement.style.setProperty('--app-accent', accent.color);
    this.documentElement.style.setProperty('--app-accent-strong', accent.strongColor);
    this.documentElement.style.setProperty('--app-accent-soft', accent.softColor);
    this.documentElement.style.setProperty('--app-accent-shadow', accent.shadowColor);
  }
}