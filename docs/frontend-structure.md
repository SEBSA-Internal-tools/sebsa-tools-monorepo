# IPM Frontend (ipm-fe)

Welcome to the frontend application for the IPM (Integrated Project Management) tool. This project is built using modern Angular with standalone components.

## Table of Contents

- [File Structure](#file-structure)
- [Architecture & Layout](#architecture--layout)
- [Components & Features](#components--features)
- [Themes & Styling](#themes--styling)

## File Structure

The `ipm-fe` application follows a feature-based structure for scalability and maintainability.

```text
apps/ipm-fe/
├── public/                 # Public static assets
├── src/                    # Source code
│   ├── app/                # Main application directory
│   │   ├── core/           # Core functionality (singleton services, layouts)
│   │   │   ├── layouts/    # Application layouts (e.g., AppShell)
│   │   │   └── services/   # Core services (e.g., ThemeService)
│   │   ├── features/       # Feature modules/components
│   │   │   ├── calendar/   # Calendar views and related components
│   │   │   ├── dashboard/  # Dashboard views and widgets
│   │   │   ├── login/      # Authentication & Login page
│   │   │   ├── notifications/# Notifications list and handling
│   │   │   ├── projects/   # Project management features
│   │   │   └── tasks/      # Task management features
│   │   ├── app.config.ts   # Angular application configuration
│   │   ├── app.routes.ts   # Application routing
│   │   ├── app.component.* # Root component
│   ├── assets/             # Images, fonts, and other static assets
│   ├── styles.scss         # Global styles and theme variables
│   └── main.ts             # Application entry point
├── project.json            # Nx project configuration
└── tsconfig.*.json         # TypeScript configuration files
```

## Architecture & Layout

### App Shell

The application utilizes an `AppShellComponent` (`src/app/core/layouts/app-shell/`) which serves as the primary layout wrapper for authenticated routes. It includes:

- A side navigation bar containing links to primary features (Dashboard, My Tasks, Projects, Calendar, Notifications).
- A top bar or header for global actions (e.g., theme switching).
- A main content area (`<router-outlet>`) where feature components are rendered.

### Standalone Components

The project leverages Angular Standalone Components, removing the need for `NgModules` and streamlining the component structure.

## Components & Features

The application is divided into key functional areas located in `src/app/features`:

- **Dashboard**: The main landing area providing an overview of projects and tasks.
- **My Tasks**: Personal task management and tracking.
- **Projects**: Management of projects, including creation, editing, and status tracking.
- **Calendar**: A timeline or calendar view of upcoming deadlines and events.
- **Notifications**: Alerts and updates relevant to the user.
- **Login**: The authentication entry point.

## Themes & Styling

### Styling Approach

The application uses **SCSS** for styling.

- **Global Styles**: Defined in `src/styles.scss`, which includes typography, global resets, and CSS variables for theming.
- **Component Styles**: Scoped SCSS files are co-located with their respective components.

### Theme System

The application supports a dynamic theming system managed by the `ThemeService` (`src/app/core/services/theme.service.ts`).

#### Color Modes

- **Light Mode**: The default bright theme.
- **Dark Mode**: A dark theme, triggered via a `data-theme="dark"` attribute on the root element.

#### Accent Colors

Users can customize their experience by selecting from multiple accent colors, which adjust the primary interactive elements across the application:

- Pink (Default)
- Blue
- Emerald
- Amber
- Violet

CSS variables (e.g., `--app-background`, `--app-surface`, `--app-accent`) are used extensively to ensure seamless transitions between themes and accents.