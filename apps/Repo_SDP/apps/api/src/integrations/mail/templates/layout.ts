export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export type EmailTone = 'brand' | 'info' | 'success' | 'warning' | 'danger';

export interface EmailCallout {
  tone: EmailTone;
  title: string;
  text: string;
}

export interface EmailTable {
  title: string;
  columns: readonly [status: string, item: string];
  rows: readonly { tone: EmailTone; status: string; item: string }[];
}

export interface EmailBody {
  tone?: EmailTone;
  /** Short state shown above the heading, e.g. "Action required". */
  label?: string;
  heading: string;
  greeting?: string;
  paragraphs: string[];
  /** Words in the first paragraph shown as a pill, e.g. "Re-Submitted". */
  highlight?: string;
  detailsTitle?: string;
  details?: readonly (readonly [label: string, value: string])[];
  callout?: EmailCallout;
  tables?: readonly EmailTable[];
  sections?: readonly { title: string; text: string }[];
  action?: { label: string; url: string };
  /** Validity of a one-time link, highlighted under the button. */
  expiry?: { lifetime: string; expiresAt: string };
  notes?: string[];
}

export interface LayoutContext {
  appName: string;
  helpEmail: string;
  sentAt: string;
  logoUrl: string;
}

interface Palette {
  strong: string;
  soft: string;
  border: string;
  text: string;
}

const PALETTES: Record<EmailTone, Palette> = {
  brand: { strong: '#5b21b6', soft: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
  info: { strong: '#1d4ed8', soft: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  success: { strong: '#15803d', soft: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  warning: { strong: '#b45309', soft: '#fffbeb', border: '#fde68a', text: '#92400e' },
  danger: { strong: '#b91c1c', soft: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
};

const automatedNotice = (appName: string) =>
  `This is an automated notification from the SEBSA ${appName} workflow. Please do not reply to this email.`;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Subjects become a mail header, so user-supplied text is flattened and capped. */
export function oneLine(value: string, max = 200): string {
  const flat = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function renderEmail(
  subject: string,
  body: EmailBody,
  context: LayoutContext,
): EmailContent {
  return {
    subject: oneLine(subject),
    text: renderText(body, context),
    html: renderHtml(subject, body, context),
  };
}

function renderText(body: EmailBody, context: LayoutContext): string {
  const lines: string[] = body.label ? [body.label.toUpperCase(), body.heading, ''] : [body.heading, ''];
  if (body.greeting) lines.push(body.greeting, '');
  for (const paragraph of body.paragraphs) lines.push(paragraph, '');
  if (body.details?.length) {
    lines.push(`${body.detailsTitle ?? 'Details'}:`);
    for (const [label, value] of body.details) lines.push(`${label}: ${value}`);
    lines.push('');
  }
  if (body.callout) lines.push(body.callout.title, body.callout.text, '');
  for (const table of body.tables ?? []) {
    lines.push(`${table.title}:`);
    for (const row of table.rows) lines.push(`- [${row.status}] ${row.item}`);
    lines.push('');
  }
  for (const section of body.sections ?? []) lines.push(`${section.title}:`, section.text, '');
  if (body.action) lines.push(`${body.action.label}:`, body.action.url, '');
  if (body.expiry) {
    lines.push(
      `This link is valid for ${body.expiry.lifetime} — expires ${body.expiry.expiresAt}.`,
      '',
    );
  }
  for (const note of body.notes ?? []) lines.push(note, '');
  if (context.helpEmail) {
    lines.push(
      `Need help? Contact the ${context.appName} administrator at ${context.helpEmail}.`,
      '',
    );
  }
  lines.push(
    '—',
    `SEBSA ${context.appName}`,
    automatedNotice(context.appName),
    `Sent ${context.sentAt}`,
  );
  return lines.join('\n');
}

function renderHtml(subject: string, body: EmailBody, context: LayoutContext): string {
  const e = escapeHtml;
  const tone = PALETTES[body.tone ?? 'brand'];
  const font = "font-family:'Segoe UI',Helvetica,Arial,sans-serif";

  const paragraphs = body.paragraphs
    .map((p, index) => {
      let html = e(p);
      if (index === 0 && body.highlight && p.includes(body.highlight)) {
        html = html.replace(
          e(body.highlight),
          `<span style="display:inline-block;padding:1px 10px;border-radius:999px;background:${tone.soft};border:1px solid ${tone.border};color:${tone.text};font-weight:600">${e(body.highlight)}</span>`,
        );
      }
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">${html}</p>`;
    })
    .join('');

  const details = body.details?.length
    ? `<p style="margin:22px 0 8px;font-size:16px;font-weight:700;color:#111827">${e(body.detailsTitle ?? 'Details')}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:0 0 20px">${body.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 16px 8px 0;border-bottom:1px solid #f1f5f9;width:150px;color:#111827;font-weight:600;vertical-align:top;white-space:nowrap">${e(label)}</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#4b5563;vertical-align:top">${e(value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const callout = body.callout
    ? (() => {
        const c = PALETTES[body.callout.tone];
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:separate"><tr><td style="background:${c.soft};border:1px solid ${c.border};border-left:4px solid ${c.strong};border-radius:6px;padding:14px 18px"><p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${c.text}">${e(body.callout.title)}</p><p style="margin:0;font-size:14px;line-height:1.55;color:#374151">${e(body.callout.text)}</p></td></tr></table>`;
      })()
    : '';

  const tables = (body.tables ?? [])
    .map(
      (table) =>
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:6px;border-collapse:separate"><tr><td style="padding:14px 16px 6px"><p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#92400e">${e(table.title)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px"><tr><th align="left" style="padding:8px 10px;background:#f3f4f6;border:1px solid #e5e7eb;color:#111827;width:120px">${e(table.columns[0])}</th><th align="left" style="padding:8px 10px;background:#f3f4f6;border:1px solid #e5e7eb;color:#111827">${e(table.columns[1])}</th></tr>${table.rows
          .map(
            (row) =>
              `<tr><td style="padding:8px 10px;border:1px solid #e5e7eb;color:${PALETTES[row.tone].text};font-weight:600;white-space:nowrap;vertical-align:top">${e(row.status)}</td><td style="padding:8px 10px;border:1px solid #e5e7eb;color:#374151;vertical-align:top">${e(row.item)}</td></tr>`,
          )
          .join('')}</table></td></tr></table>`,
    )
    .join('');

  const sections = (body.sections ?? [])
    .map(
      (section) =>
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:6px;border-collapse:separate"><tr><td style="padding:14px 16px"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827">${e(section.title)}</p><p style="margin:0;font-size:14px;line-height:1.55;color:#374151;white-space:pre-line">${e(section.text)}</p></td></tr></table>`,
    )
    .join('');

  const action = body.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr><td style="border-radius:6px;background:${tone.strong}"><a href="${e(body.action.url)}" target="_blank" style="display:inline-block;padding:12px 24px;${font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${e(body.action.label)}</a></td></tr></table>`
    : '';

  const expiry = body.expiry
    ? (() => {
        const w = PALETTES.warning;
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:separate"><tr><td bgcolor="${w.soft}" style="background:${w.soft};border:1px solid ${w.border};border-left:4px solid ${w.strong};border-radius:6px;padding:12px 16px;font-size:14px;line-height:1.55;color:${w.text}">&#9201;&#65039; This link is valid for <strong>${e(body.expiry.lifetime)}</strong> — expires <strong>${e(body.expiry.expiresAt)}</strong>.</td></tr></table>`;
      })()
    : '';

  const notes = (body.notes ?? [])
    .map(
      (n) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280">${e(n)}</p>`,
    )
    .join('');

  const greeting = body.greeting
    ? `<p style="margin:0 0 14px;font-size:15px;color:#111827;font-weight:600">${e(body.greeting)}</p>`
    : '';

  const label = body.label
    ? `<p style="margin:0 0 6px;${font};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ffffff;opacity:.85">${e(body.label)}</p>`
    : '';

  const help = context.helpEmail
    ? `<tr><td bgcolor="#ffffff" style="padding:0 28px 24px;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td bgcolor="#f5f3ff" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:14px 18px"><p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#481484">Need help?</p><p style="margin:0;font-size:14px;line-height:1.55;color:#4c1d95">Contact the ${e(context.appName)} administrator at <a href="mailto:${e(context.helpEmail)}" style="color:#5b21b6;font-weight:600;text-decoration:underline">${e(context.helpEmail)}</a>.</p></td></tr></table></td></tr>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${e(oneLine(subject))}</title></head>
<body bgcolor="#f3f4f6" style="margin:0;padding:0;background:#f3f4f6;${font};color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6" style="background:#f3f4f6;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;overflow:hidden">
<tr><td bgcolor="#ffffff" style="padding:18px 28px;background:#ffffff;border-bottom:1px solid #eef0f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td align="left" style="vertical-align:middle"><img src="${e(context.logoUrl)}" width="150" alt="SEBSA" style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none;text-decoration:none"></td>
<td align="right" style="vertical-align:middle;font-size:13px;font-weight:600;color:#481484;letter-spacing:.02em">${e(context.appName)}</td>
</tr></table>
</td></tr>
<tr><td align="center" bgcolor="${tone.strong}" style="background:${tone.strong};padding:22px 28px">${label}<h1 style="margin:0;${font};font-size:22px;line-height:1.3;font-weight:700;color:#ffffff">${e(body.heading)}</h1></td></tr>
<tr><td bgcolor="#ffffff" style="padding:26px 28px 8px;background:#ffffff">
${greeting}${paragraphs}${details}${callout}${tables}${sections}${action}${expiry}${notes}
</td></tr>
${help}
<tr><td align="center" bgcolor="#f9fafb" style="padding:18px 28px;background:#f9fafb;border-top:1px solid #eef0f3">
<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#374151">SEBSA ${e(context.appName)}</p>
<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#6b7280">${e(automatedNotice(context.appName))}</p>
<p style="margin:0;font-size:12px;color:#9ca3af">Sent ${e(context.sentAt)}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
