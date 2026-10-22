import { env } from '@/lib/env';

interface EmailTemplateInput {
  heading: string;
  body: string;
  ctaLabel?: string;
  /** A path like `/repository/abc` — resolved against NEXT_PUBLIC_APP_URL since email clients
   *  have no notion of the app's origin. */
  ctaPath?: string;
}

/**
 * Minimal branded HTML wrapper shared by every notification email. Inline styles only — most
 * email clients strip <style> blocks, the same "inline or it silently breaks" constraint
 * lib/templates/cvTemplate.ts documents for html2canvas, for a different underlying reason.
 */
export function renderEmailHtml({ heading, body, ctaLabel, ctaPath }: EmailTemplateInput): string {
  const button =
    ctaLabel && ctaPath
      ? `<a href="${env.NEXT_PUBLIC_APP_URL}${ctaPath}" style="display:inline-block;margin-top:20px;padding:12px 24px;background-color:#4E1C90;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;border-radius:8px;">${ctaLabel}</a>`
      : '';

  return `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background-color: #ffffff;">
  <p style="color:#7650E1;font-size:12px;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;margin:0 0 20px 0;">SEBSA Employee Management Portal</p>
  <h1 style="color:#262626;font-size:19px;font-weight:800;margin:0 0 12px 0;">${heading}</h1>
  <p style="color:#404040;font-size:13px;line-height:1.6;margin:0;">${body}</p>
  ${button}
  <p style="color:#A0A0A0;font-size:11px;margin-top:32px;padding-top:16px;border-top:1px solid #EEEEEE;">This is an automated notification — please don't reply to this email.</p>
</div>`.trim();
}
