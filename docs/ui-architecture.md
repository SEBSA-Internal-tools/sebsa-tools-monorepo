# SEBSA PM Tool — Frontend Architecture & Design System Guidelines

> **Brand Identity:** Luminous Depth  
> **Aesthetic Archetype:** Modern Glassmorphic Dual-Theme (Light & Dark)  
> **Target Framework:** Angular 19+ (SCSS Component Architecture)  
> **Document Version:** 2.0.0  

---

## Executive Summary

This document serves as the canonical Design System and Frontend UI Architecture guideline for the **SEBSA PM Tool** Angular application. Designed under our unified brand identity **"Luminous Depth"**, the system enforces a strict dual-theme strategy (**Light Mode** and **Dark Mode**) driven by the `[data-theme="dark"]` attribute on the `<html>` document root element.

Custom user accent pickers and arbitrary color themes are strictly disabled to preserve brand consistency and visual integrity.

---

## 1. Dual-Theme Strategy & Architectural Rules

### 1.1 Theme Mechanics
- **Default Theme**: Light Mode (`:root` selector without attributes or `[data-theme="light"]`).
- **Dark Mode**: Activated by applying `[data-theme="dark"]` to `document.documentElement` (`<html data-theme="dark">`).
- **Persistence**: User theme selection is stored in `localStorage` (`ipm-fe.theme`) and remembered across browser sessions.

### 1.2 Theme Comparison Matrix

| Token Category | Light Mode Default (`:root`) | Dark Mode Override (`[data-theme="dark"]`) |
| :--- | :--- | :--- |
| **Background Canvas** | `#f8f9fa` (Soft off-white canvas, never pure `#fff`) | `#12121d` (Deep Purple dark void) |
| **Surface Panels** | `#ffffff` (Elevated with soft drop shadows) | `#383845` / `rgba(56, 56, 69, 0.4)` (Frosted glass) |
| **Glass / Panel Borders** | `1px solid rgba(0, 0, 0, 0.08)` | `1px solid rgba(255, 255, 255, 0.08)` |
| **Brand Primary** | `#7000ff` (Electric Violet) | `#7000ff` (Electric Violet) |
| **Accent Gradient** | Magenta (`#ff00ff`) to Violet (`#7000ff`) (used sparingly) | Magenta (`#ff00ff`) to Violet (`#7000ff`) (ambient glow) |
| **Primary Text** | `#1e1e2d` (Dark slate/gray for high legibility) | `#f4f4f7` (Crisp off-white) |
| **Secondary Text** | `rgba(30, 30, 45, 0.68)` | `rgba(244, 244, 247, 0.68)` |
| **Shadows & Glows** | Soft elevation shadow `0 4px 20px rgba(0,0,0,0.06)` | Ambient purple glow `0 4px 15px rgba(112, 0, 255, 0.4)` |

---

## 2. Core Color Palette & CSS Variables Mapping

All components must consume these CSS Custom Properties defined in `apps/ipm-fe/src/styles.scss`.

```css
/* ==========================================================================
   Light Mode (Default :root)
   ========================================================================== */
:root {
  --color-bg-main: #f8f9fa;
  --color-brand-primary: #7000ff;
  --color-accent-magenta: #ff00ff;
  --color-accent-violet: #7000ff;

  /* Brand Gradient (Used sparingly in Light Mode) */
  --color-accent-gradient: linear-gradient(135deg, #ff00ff 0%, #7000ff 100%);
  --color-accent-gradient-hover: linear-gradient(135deg, #ff33ff 0%, #851aff 100%);
  --color-accent-gradient-active: linear-gradient(135deg, #e600e6 0%, #6300e6 100%);

  /* Surface & Panel Tokens */
  --color-surface-bright: #ffffff;
  --color-surface-dim: rgba(255, 255, 255, 0.85);
  --color-surface-glass: rgba(255, 255, 255, 0.75);
  --color-surface-glass-hover: rgba(255, 255, 255, 0.95);
  --color-surface-glass-active: #ffffff;

  /* Borders & Shadows */
  --border-glass: 1px solid rgba(0, 0, 0, 0.08);
  --border-glass-hover: 1px solid rgba(112, 0, 255, 0.25);
  --border-glass-active: 1px solid rgba(112, 0, 255, 0.5);

  --backdrop-blur: blur(16px);
  --backdrop-blur-heavy: blur(24px);

  --shadow-subtle: 0 4px 20px rgba(0, 0, 0, 0.06);
  --shadow-glow-purple: 0 4px 15px rgba(112, 0, 255, 0.25);
  --shadow-glow-focus: 0 0 0 3px rgba(112, 0, 255, 0.2);

  /* Typography */
  --text-primary: #1e1e2d;
  --text-secondary: rgba(30, 30, 45, 0.68);
  --text-muted: rgba(30, 30, 45, 0.45);
  --text-brand: #7000ff;

  /* Status Colors */
  --status-success: #00b87c;
  --status-warning: #e69d00;
  --status-error: #e62e5c;
  --status-info: #0099e6;
}

/* ==========================================================================
   Dark Mode Overrides ([data-theme="dark"])
   ========================================================================== */
[data-theme="dark"] {
  --color-bg-main: #12121d;
  --color-brand-primary: #7000ff;
  --color-accent-magenta: #ff00ff;
  --color-accent-violet: #7000ff;

  --color-accent-gradient: linear-gradient(135deg, #ff00ff 0%, #7000ff 100%);
  --color-accent-gradient-hover: linear-gradient(135deg, #ff33ff 0%, #851aff 100%);
  --color-accent-gradient-active: linear-gradient(135deg, #e600e6 0%, #6300e6 100%);

  --color-surface-bright: #383845;
  --color-surface-dim: rgba(18, 18, 29, 0.6);
  --color-surface-glass: rgba(56, 56, 69, 0.4);
  --color-surface-glass-hover: rgba(56, 56, 69, 0.55);
  --color-surface-glass-active: rgba(56, 56, 69, 0.7);

  --border-glass: 1px solid rgba(255, 255, 255, 0.08);
  --border-glass-hover: 1px solid rgba(255, 255, 255, 0.18);
  --border-glass-active: 1px solid rgba(112, 0, 255, 0.4);

  --shadow-subtle: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  --shadow-glow-purple: 0 4px 15px rgba(112, 0, 255, 0.4);
  --shadow-glow-focus: 0 0 0 3px rgba(112, 0, 255, 0.35);

  --text-primary: #f4f4f7;
  --text-secondary: rgba(244, 244, 247, 0.68);
  --text-muted: rgba(244, 244, 247, 0.42);
  --text-brand: #a855ff;

  --status-success: #00e699;
  --status-warning: #ffb300;
  --status-error: #ff3366;
  --status-info: #00bfff;
}
```

---

## 3. Typography Architecture

- **Font Family**: `"Sora", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Weight 300 (Light)**: Headings & Page Titles (`letter-spacing: -0.03em`)
- **Weight 400 (Regular)**: Body & Data fields (`letter-spacing: -0.01em`)
- **Weight 600 (Semi-Bold)**: Actions, Buttons, Nav items (`letter-spacing: -0.015em`)

---

## 4. Architectural Component Guidelines

### 4.1 Cards & Panels (`.glass-card`)
In Light Mode, cards render with clean white surface backgrounds and soft drop shadows. In Dark Mode, cards utilize frosted glass (`backdrop-filter: blur(16px)`) with semi-transparent fills.

### 4.2 Tactile Buttons (`.btn-primary`)
Primary CTA buttons use the brand gradient (`#ff00ff` to `#7000ff`) with glowing shadows on hover. In Light Mode, gradient usage is balanced to maintain legibility and avoid glare.

---

## 5. Implementation & Theme Toggle Logic

The theme toggle switch modifies the `data-theme` attribute on `document.documentElement` and persists the selection in `localStorage`:

```typescript
// Theme toggle logic pattern
export class AppShellComponent {
  currentTheme: 'light' | 'dark' = 'dark';

  ngOnInit(): void {
    const saved = localStorage.getItem('ipm-fe.theme') as 'light' | 'dark' | null;
    this.currentTheme = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.applyTheme();
  }

  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme();
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    localStorage.setItem('ipm-fe.theme', this.currentTheme);
  }
}
```
