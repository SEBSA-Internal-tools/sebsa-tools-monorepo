import { describe, expect, it } from 'vitest';
import { validate } from './env.validation.js';

const secrets = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const production = {
  ...secrets,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:pw@db.example.com/sdp?sslmode=require',
  FRONTEND_ORIGIN: 'https://sdp.example.com',
};

describe('environment validation', () => {
  it('accepts a production deployment served over HTTPS end to end', () => {
    expect(() => validate(production)).not.toThrow();
  });

  it('refuses Secure-less cookies in production', () => {
    expect(() => validate({ ...production, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });

  it('refuses a plain-HTTP frontend origin in production', () => {
    expect(() =>
      validate({
        ...production,
        FRONTEND_ORIGIN: 'https://sdp.example.com,http://sdp.example.com',
      }),
    ).toThrow(/FRONTEND_ORIGIN/);
  });

  it('refuses a database connection without TLS in production', () => {
    expect(() =>
      validate({ ...production, DATABASE_URL: 'postgresql://app:pw@db.example.com/sdp' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('refuses TRUST_PROXY=true, which would trust any X-Forwarded-For', () => {
    expect(() => validate({ ...production, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => validate({ ...production, TRUST_PROXY: '1' })).not.toThrow();
  });

  it('keeps local development on http://localhost working', () => {
    expect(() =>
      validate({
        ...secrets,
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/sdp',
        FRONTEND_ORIGIN: 'http://localhost:5175',
      }),
    ).not.toThrow();
  });
});
