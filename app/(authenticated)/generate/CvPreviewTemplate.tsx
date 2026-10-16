'use client';

import React, { useMemo } from 'react';
import Handlebars from 'handlebars';
import { cvTemplateSource } from '@/lib/templates/cvTemplate';
import { cvTemplate2Source } from '@/lib/templates/cvTemplate2';
import { splitProjectDescription } from '@/lib/projectDescription';
import type { TailoredCv } from './types';

interface CvPreviewTemplateProps {
  cv: TailoredCv;
  highlightFields?: string[];
  onChange?: (updated: TailoredCv) => void;
  /**
   * Defaults to 'cv-preview-root' — the id `lib/cvExport.ts`'s `exportToPdf` screenshots. Pass a
   * different id for any additional mounted copy (e.g. a decorative thumbnail) so it doesn't
   * collide — duplicate DOM ids mean `getElementById` silently grabs whichever renders first,
   * which previously caused PDF export to capture a scaled-down thumbnail instead of the real
   * preview (docs/04-rbac-security.md §15).
   */
  id?: string;
}

export default function CvPreviewTemplate({ cv, onChange, id = 'cv-preview-root', highlightFields = [] }: CvPreviewTemplateProps) {
  // Compile the Handlebars template with the current CV data
  const compiledHtml = useMemo(() => {
    try {
      const templateSource = cv.templateId === 'template2' ? cvTemplate2Source : cvTemplateSource;
      const template = Handlebars.compile(templateSource);
      const html = template({
        ...cv,
        // Backward compatibility: CVs saved before education selection existed include it.
        includeEducation: cv.includeEducation !== false,
        specialProjects: cv.specialProjects.map((project) => ({
          ...project,
          descriptionPoints: splitProjectDescription(project.brief),
        })),
      });
      if (highlightFields.length === 0) return html;
      const selectors = highlightFields
        .map((field) => `[data-cv-field="${field.replace(/["\\]/g, '')}"]`)
        .join(',');
      return `<style>${selectors}{outline:3px solid #F59E0B;outline-offset:4px;background-color:#FFFBEB!important;border-radius:6px;}</style>${html}`;
    } catch (error) {
      console.error('Handlebars compilation error:', error);
      return '<div class="text-rose-500">Error compiling preview template.</div>';
    }
  }, [cv, highlightFields]);

  return (
    <div
      id={id}
      // Deliberately inline styles only, no Tailwind/utility classes — this node (and everything
      // Handlebars renders inside it) is screenshotted by html2canvas for PDF export, and
      // Tailwind v4's default palette is oklch(), which html2canvas 1.x cannot parse (it throws
      // and PDF export silently fails). See lib/templates/cvTemplate.ts's header comment.
      style={{
        width: '100%',
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: '#ffffff',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
        fontFamily: "'Poppins', 'Segoe UI', Arial, sans-serif",
        fontSize: '14px',
        color: '#2D3748',
      }}
      contentEditable
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: compiledHtml }}
    />
  );
}
