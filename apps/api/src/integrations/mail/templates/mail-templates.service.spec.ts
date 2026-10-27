import { describe, expect, it } from 'vitest';
import { escapeHtml, oneLine } from './layout.js';
import { testConfig } from '../../../config/test-config.js';
import { MailTemplates } from './mail-templates.service.js';

const config = testConfig({
  APP_BASE_URL: 'https://sdp.example.com/',
  APP_TIMEZONE: 'Asia/Colombo',
  SDP_SUPPORT_EMAIL: 'support@example.com',
});
const templates = new MailTemplates(config as never);

const issuedAt = new Date('2026-10-10T08:00:00.000Z');
const expiresAt = new Date('2026-10-11T08:00:00.000Z');

describe('MailTemplates', () => {
  it('formats times in the configured zone, with the offset', () => {
    expect(templates.formatDateTime(issuedAt)).toBe('10 Oct 2026, 13:30 (GMT+5:30)');
  });

  it('builds the invite with the link in both parts, as a fragment only', () => {
    const email = templates.userInvite({ name: 'Ana', token: 'tok_-123', expiresAt, issuedAt });
    const url = 'https://sdp.example.com/set-password#token=tok_-123';
    expect(email.subject).toBe('You have been invited to the Service Delivery Portal');
    expect(email.text).toContain(url);
    expect(email.html).toContain(url);
    expect(email.text).toContain('activate your account within 24 hours');
    expect(email.text).toContain('service.delivery@sebsaworld.com');
    expect(email.text).toContain('This is a one time link.');
    expect(email.text).toContain(
      'This link is valid for 24 hours — expires 11 Oct 2026, 13:30 (GMT+5:30).',
    );
    expect(email.html).toContain(
      'valid for <strong>24 hours</strong> — expires <strong>11 Oct 2026, 13:30 (GMT+5:30)</strong>',
    );
    expect(email.text).not.toMatch(/[?&]token=/);
    const links = [...email.html.matchAll(/<a href="(?!mailto:)([^"]+)"/g)].map(([, h]) => h);
    expect(links).toEqual([url]);
  });

  it('derives the reset validity from the real lifetime', () => {
    const email = templates.passwordReset({
      name: 'Ana',
      token: 't',
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 60 * 60 * 1000),
    });
    expect(email.text).toContain('This link is valid for 1 hour');
    expect(email.html).toContain('valid for <strong>1 hour</strong>');
  });

  it('shows the help panel with the admin contact instead of a footer "Questions?"', () => {
    const email = templates.passwordChanged({ name: 'A', at: issuedAt, firstPassword: false });
    expect(email.html).toContain('Need help?');
    expect(email.html).toContain('href="mailto:service.delivery@sebsaworld.com"');
    expect(email.html).not.toContain('Questions?');
    expect(email.html).not.toContain('support@example.com');
    expect(email.html).toContain('Security notice');
    expect(email.html).not.toContain('This link is valid');
    expect(email.text).toContain(
      'This is an automated notification from the SEBSA Service Delivery Portal workflow. Please do not reply to this email.',
    );
  });

  it('escapes user-supplied text in HTML and keeps subjects on one line', () => {
    const email = templates.accessChanged({
      name: '<script>alert(1)</script>',
      at: issuedAt,
      actorName: '"><img src=x onerror=alert(1)>',
      summary: 'Role removed',
      reason: "O'Brien & co",
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('O&#39;Brien &amp; co');
    expect(email.text).toContain('<script>alert(1)</script>');
  });

  it('flattens line breaks out of subjects', () => {
    expect(oneLine('Task\r\nBcc: x@y.z')).toBe('Task Bcc: x@y.z');
    expect(oneLine('x'.repeat(300))).toHaveLength(200);
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('leaves no unfilled placeholders', () => {
    const emails = [
      templates.userInvite({ name: 'A', token: 't', expiresAt, issuedAt }),
      templates.passwordReset({ name: 'A', token: 't', expiresAt, issuedAt }),
      templates.passwordChanged({ name: 'A', at: issuedAt, firstPassword: false }),
      templates.emailChangedNotice({
        name: 'A',
        newEmailMasked: 'b***@x.com',
        at: issuedAt,
        actorName: 'Admin',
      }),
      templates.accessChanged({ name: 'A', at: issuedAt, actorName: 'Admin', summary: 'x' }),
    ];
    for (const email of emails) {
      expect(`${email.subject}${email.text}${email.html}`).not.toMatch(/\{\{|undefined|null|NaN/);
    }
  });
});
