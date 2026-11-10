import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().port().required(),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),
  DATABASE_URL: Joi.string().uri().required(),

  // min(16) alone would happily accept the shipped placeholder, so production
  // additionally rejects it by value.
  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .invalid('change-me-to-a-long-random-string')
        .messages({ 'any.invalid': 'JWT_SECRET is still the placeholder value.' }),
    }),
  JWT_EXPIRES_IN: Joi.string().default('8h'),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),

  // Set to "true" only when the app actually runs behind a load balancer,
  // otherwise X-Forwarded-For can be spoofed to bypass rate limiting.
  TRUST_PROXY: Joi.string().valid('true', 'false').default('false'),

  // Comma-separated corporate email domains allowed to self-register, e.g.
  // "sebsaworld.com,sebsa.com". Required (no default) so a misconfiguration
  // can't accidentally open signup to any domain.
  SIGNUP_ALLOWED_EMAIL_DOMAINS: Joi.string().required(),

  // Jira sync — optional. Omit all of these to run with Jira sync disabled
  // (JiraClientService.isConfigured() gates every call on this).
  JIRA_BASE_URL: Joi.string().uri().optional(),
  JIRA_EMAIL: Joi.string().email().optional(),
  JIRA_API_TOKEN: Joi.string().optional(),
  JIRA_PROJECT_KEY: Joi.string().optional(),
  JIRA_CLOUD_ID: Joi.string().optional(),
  // Off by default — see JiraPollService. Must be the literal string "true".
  JIRA_POLLING_ENABLED: Joi.string().valid('true', 'false').optional(),
});
