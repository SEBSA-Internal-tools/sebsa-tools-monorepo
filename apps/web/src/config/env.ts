/**
 * Environment access, resolved once.
 *
 * Reading `import.meta.env` directly from components would scatter defaults and
 * default here, so a fresh clone boots in mock mode with no configuration.
 */
