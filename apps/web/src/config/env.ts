/**
 * Environment access, resolved once.
 *
 * Reading `import.meta.env` directly from components would scatter defaults.
 * Authentication deliberately has no mock-mode setting: browser builds always
 * use the real NestJS API through `/api`.
 */
