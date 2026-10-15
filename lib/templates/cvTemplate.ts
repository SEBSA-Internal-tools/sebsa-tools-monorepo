/**
 * Live on-screen CV preview/edit template (Handlebars), compiled by CvPreviewTemplate.tsx and
 * rendered into #cv-preview-root. That same DOM node drives PDF export (lib/cvExport.ts,
 * html2canvas) — so every style here MUST be inline (no Tailwind/utility classes, no oklch()),
 * or html2canvas throws and PDF export silently fails (see docs/04-rbac-security.md history —
 * Tailwind v4's default palette is oklch(), which html2canvas 1.x cannot parse).
 *
 * Visual design mirrors the SEBSA reference template: portrait photo beside a stacked
 * logo/name/title header, a purple divider bar, and gradient "notch corner" section labels
 * (Objective + Academic + Skills on the left; Experience + Special Projects on the right).
 * Certifications are deliberately folded into the Academic block (a sub-label under the same
 * header) rather than given their own top-level section — product direction, demo-readiness pass.
 * Field names are exactly TailoredCv's (app/(authenticated)/generate/types.ts) — no renaming —
 * since CvSectionEditor.tsx edits that same shape directly.
 */
export const cvTemplateSource = `
<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #262626; line-height: 1.55; max-width: 800px; margin: 0 auto; padding: 32px; background-color: #ffffff;">
  <!-- Header: photo, then logo/name/title/degree stacked beside it -->
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
    <tr>
      <td style="width: 100px; vertical-align: top;">
        {{#if avatar}}
        <div data-cv-profile-image-url="{{avatar}}" style="width: 85px; height: 105px; border-radius: 6px; background-image: url('{{avatar}}'); background-size: cover; background-position: center; background-repeat: no-repeat; display: block;"></div>
        {{else}}
        <div style="width: 85px; height: 105px; border-radius: 6px; border: 2px solid #E2E8F0; background-color: #F7FAFC; display: flex; align-items: center; justify-content: center;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-label="Generic profile icon">
            <circle cx="12" cy="8" r="4"></circle>
            <path d="M4 21a8 8 0 0 1 16 0"></path>
          </svg>
        </div>
        {{/if}}
      </td>
      <td style="vertical-align: top; padding-left: 6px;">
        <img src="/images/seb-logo-1.png" alt="SEBSA" style="width: 100px; height: auto; display: block; margin-bottom: 8px;" />
        <h1 style="color: #262626; font-size: 24px; font-weight: 800; margin: 0 0 4px 0;">{{name}}</h1>
        <h2 data-cv-field="Role" style="color: #028BDE; font-size: 13px; font-weight: 700; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.6px;">{{currentPosition}}</h2>
        {{#if academic.[0].qualification}}
        <p style="color: #7F7F7F; font-size: 12px; margin: 0;">{{academic.[0].qualification}}</p>
        {{/if}}
      </td>
    </tr>
  </table>

  <!-- Two-column body -->
  <table style="width: 100%; border-collapse: collapse;">
    <tr>
      <!-- Left column: Objective + Academic + Skills + Certifications -->
      <td style="width: 34%; vertical-align: top; padding-right: 18px;">
        {{#if summary}}
        <div data-cv-field="Objective" style="margin-bottom: 22px;">
          <div style="display: flex; align-items: center; width: 100%; box-sizing: border-box; background: linear-gradient(to right, #7650E1, #4E1C90); color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 0px 0px 12px 16px; line-height: 1; height: 30px; border-radius: 10px 0 10px 0; margin-bottom: 10px;">Objective</div>
          <p style="font-size: 12px; margin: 0; color: #404040; text-align: justify;">{{summary}}</p>
        </div>
        {{/if}}

        {{#if academic}}
        <div data-cv-field="Education" style="margin-bottom: 22px;">
          <div style="display: flex; align-items: center; width: 100%; box-sizing: border-box; background: linear-gradient(to right, #7650E1, #4E1C90); color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 0px 0px 12px 16px; line-height: 1; height: 30px; border-radius: 10px 0 10px 0; margin-bottom: 10px;">Academic</div>
          {{#each academic}}
          <div style="margin-bottom: 12px;">
            <p style="font-size: 12.5px; font-weight: 700; color: #262626; margin: 0;">{{qualification}}</p>
            <p style="font-size: 11.5px; color: #7F7F7F; margin: 2px 0 0 0;">{{institution}} ({{period}})</p>
          </div>
          {{/each}}

          {{#each certifications}}
          <div data-cv-field="Certifications" style="margin-bottom: 12px;">
            <p style="font-size: 12.5px; font-weight: 700; color: #262626; margin: 0;">{{name}}</p>
            <p style="font-size: 11.5px; color: #7F7F7F; margin: 2px 0 0 0;">{{issuer}}{{#if year}} ({{year}}){{/if}}</p>
          </div>
          {{/each}}
        </div>
        {{else}}
          {{#if certifications}}
          <div data-cv-field="Certifications" style="margin-bottom: 22px;">
            <div style="display: flex; align-items: center; width: 100%; box-sizing: border-box; background: linear-gradient(to right, #7650E1, #4E1C90); color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 0px 0px 12px 16px; line-height: 1; height: 30px; border-radius: 10px 0 10px 0; margin-bottom: 10px;">Academic</div>
            {{#each certifications}}
            <div style="margin-bottom: 12px;">
              <p style="font-size: 12.5px; font-weight: 700; color: #262626; margin: 0;">{{name}}</p>
              <p style="font-size: 11.5px; color: #7F7F7F; margin: 2px 0 0 0;">{{issuer}}{{#if year}} ({{year}}){{/if}}</p>
            </div>
            {{/each}}
          </div>
          {{/if}}
        {{/if}}

        {{#if skillsAligned}}
        <div data-cv-field="Skills" style="margin-bottom: 22px;">
          <div style="display: flex; align-items: center; width: 100%; box-sizing: border-box; background: linear-gradient(to right, #7650E1, #4E1C90); color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 0px 0px 12px 16px; line-height: 1; height: 30px; border-radius: 10px 0 10px 0; margin-bottom: 10px;">Skills</div>
          <div style="font-size: 11.5px; color: #404040; line-height: 2;">
            {{#each skillsAligned}}
              <span style="display: inline-block; background-color: #F3EEFC; color: #4E1C90; padding: 3px 9px; margin: 0 4px 4px 0; border-radius: 4px; font-weight: 600;">{{this}}</span>
            {{/each}}
          </div>
        </div>
        {{/if}}
      </td>

      <!-- Right column: Experience + Special Projects -->
      <td style="width: 66%; vertical-align: top; padding-left: 18px;">
        {{#if experience}}
        <div data-cv-field="Work Experience" style="margin-bottom: 22px;">
          <div style="display: flex; align-items: center; width: 100%; box-sizing: border-box; background: linear-gradient(to right, #7650E1, #4E1C90); color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 0px 0px 12px 16px; line-height: 1; height: 30px; border-radius: 10px 0 10px 0; margin-bottom: 12px;">Experience</div>
          {{#each experience}}
          <div style="margin-bottom: 14px;">
            <p style="font-size: 13px; margin: 0 0 4px 0;">
              <span style="font-weight: 700; color: #262626;">{{position}} — {{company}}</span>
              <span style="font-weight: 600; color: #7F7F7F; font-style: italic;"> ({{period}})</span>
            </p>
            {{#if tasks}}
            <table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
              {{#each tasks}}
              <tr>
                <td style="width: 12px; vertical-align: top; font-size: 12px; color: #404040; line-height: 1.55; padding: 0;">•</td>
                <td style="vertical-align: top; font-size: 12px; color: #404040; line-height: 1.55; padding: 0 0 3px 0; text-align: justify;">{{this}}</td>
              </tr>
              {{/each}}
            </table>
            {{/if}}
          </div>
          {{/each}}
        </div>
        {{/if}}

        {{#if specialProjects}}
        <div data-cv-field="Special Projects" style="margin-bottom: 22px;">
          <div style="display: flex; align-items: center; width: 100%; box-sizing: border-box; background: linear-gradient(to right, #7650E1, #4E1C90); color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 0px 0px 12px 16px; line-height: 1; height: 30px; border-radius: 10px 0 10px 0; margin-bottom: 12px;">Special Projects</div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
            {{#each specialProjects}}
            <tr>
              <td style="vertical-align: top; padding: 0 0 10px 0;">
                <p style="font-size: 12px; font-weight: 700; color: #262626; margin: 0 0 3px 0;">{{title}}</p>
                {{#if descriptionPoints}}
                <table style="width: 100%; border-collapse: collapse;">
                  {{#each descriptionPoints}}
                  <tr>
                    <td style="width: 12px; vertical-align: top; font-size: 12px; color: #404040; line-height: 1.55; padding: 0;">•</td>
                    <td style="vertical-align: top; font-size: 12px; color: #404040; line-height: 1.55; padding: 0 0 3px 0; text-align: justify;">{{this}}</td>
                  </tr>
                  {{/each}}
                </table>
                {{/if}}
              </td>
            </tr>
            {{/each}}
          </table>
        </div>
        {{/if}}
      </td>
    </tr>
  </table>
</div>
`;
