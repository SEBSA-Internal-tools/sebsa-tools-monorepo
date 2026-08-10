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

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),

  // Comma-separated corporate email domains allowed to self-register, e.g.
  // "sebsaworld.com,sebsa.com". Required (no default) so a misconfiguration
  // can't accidentally open signup to any domain.
  SIGNUP_ALLOWED_EMAIL_DOMAINS: Joi.string().required(),
});
