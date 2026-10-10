/// <reference types="vite/client" />

/** Build-time settings; see apps/web/.env.example and src/config/env.ts. */
interface ImportMetaEnv {
  readonly VITE_EMAIL_PLACEHOLDER?: string;
}
