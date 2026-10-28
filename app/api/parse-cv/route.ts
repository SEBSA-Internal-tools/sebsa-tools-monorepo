import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import type { CvProfile } from '@/lib/cvTypes';
import { toUpperCaseText } from '@/lib/text';

/**
 * POST /api/parse-cv
 *
 * Accepts { text: string } in the request body.
 * Calls Google Gemini to extract a structured CvProfile from the raw CV text.
 * Uses Gemini's native structured JSON generation — no free-text JSON parsing.
 *
 * Model: gemini-2.5-pro
 * (swap to "gemini-2.5-flash" for lower cost and faster responses)
 */

const SYSTEM_PROMPT = `You are an expert CV parser.

Extract ONLY the information explicitly present in the provided CV.

Never fabricate, infer, or guess missing information.

If information is missing, return an empty string or empty array.

Return ONLY structured JSON matching the provided schema exactly.

Do not include markdown, explanations, comments, or additional fields.`;

// Gemini responseSchema mirroring CvProfile exactly
const CV_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: "Candidate's full name",
    },
    currentPosition: {
      type: Type.STRING,
      description: "Current or most recent job title",
    },
    summary: {
      type: Type.STRING,
      description: "The candidate's own Objective/Summary/Profile statement, verbatim or lightly cleaned up, ONLY if the CV explicitly has one. Return an empty string if no such section exists — do not compose one.",
    },
    experience: {
      type: Type.ARRAY,
      description: "Work experience entries",
      items: {
        type: Type.OBJECT,
        properties: {
          position: { type: Type.STRING, description: "Job title / position" },
          company: { type: Type.STRING, description: "Employer name" },
          period: {
            type: Type.STRING,
            description: "Employment period exactly as stated in the CV. Preserve every available day, month, and year; never reduce a full date to only its year and never invent a missing day or month. Prefer unambiguous ISO YYYY-MM-DD for complete dates, e.g. '2020-01-15 – 2023-12-31'. Preserve month/year-only values as written, e.g. 'Jan 2020 – Present'.",
          },
          tasks: {
            type: Type.ARRAY,
            description: "Point-wise responsibilities and achievements for this role",
            items: { type: Type.STRING },
          },
        },
        required: ['position', 'company', 'period', 'tasks'],
      },
    },
    academic: {
      type: Type.ARRAY,
      description: "Academic / educational qualifications",
      items: {
        type: Type.OBJECT,
        properties: {
          qualification: { type: Type.STRING, description: "Degree or qualification name" },
          institution: { type: Type.STRING, description: "University or institution name" },
          period: { type: Type.STRING, description: "Study period, e.g. '2014 – 2018'" },
        },
        required: ['qualification', 'institution', 'period'],
      },
    },
    specialProjects: {
      type: Type.ARRAY,
      description: "Notable special projects",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Project title" },
          brief: { type: Type.STRING, description: "Short description of the project" },
        },
        required: ['title', 'brief'],
      },
    },
    certifications: {
      type: Type.ARRAY,
      description: "Professional certifications",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Certification name" },
          issuer: { type: Type.STRING, description: "Issuing body or organisation" },
          year: { type: Type.STRING, description: "Year awarded, e.g. '2022'" },
        },
        required: ['name', 'issuer', 'year'],
      },
    },
  },
  required: ['name', 'currentPosition', 'summary', 'experience', 'academic', 'specialProjects', 'certifications'],
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Parse & validate request body ─────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).text !== 'string'
  ) {
    return NextResponse.json({ error: 'Request body must be { text: string }.' }, { status: 400 });
  }

  const text = ((body as Record<string, unknown>).text as string).trim();
  if (text.length === 0) {
    return NextResponse.json({ error: 'text field must not be empty.' }, { status: 400 });
  }

  // ── 2. Initialise Gemini client (API key is server-only, never sent to client) ──
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in environment variables.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  const ai = new GoogleGenAI({ apiKey });

  // ── 3. Call Gemini with structured JSON output ────────────────────────────
  let rawText: string;
  try {
    const response = await ai.models.generateContent({
      // Use gemini-2.5-pro; swap to "gemini-2.5-flash" for lower cost and faster responses
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [{ text: `Parse the following CV and extract structured information:\n\n${text}` }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: CV_RESPONSE_SCHEMA,
      },
    });

    rawText = response.text ?? '';
  } catch (err) {
    console.error('Gemini API call failed:', err);
    return NextResponse.json(
      { error: 'AI service unavailable. Please try again.' },
      { status: 500 }
    );
  }

  // ── 4. Parse & validate the structured JSON response ─────────────────────
  let profile: CvProfile;
  try {
    profile = JSON.parse(rawText) as CvProfile;

    // Basic shape validation — Gemini's schema enforcement should guarantee
    // these, but we guard defensively.
    if (typeof profile.name !== 'string' || !Array.isArray(profile.experience)) {
      throw new Error('Response shape mismatch.');
    }
  } catch (err) {
    console.error('Failed to parse Gemini structured response:', err, '\nRaw:', rawText);
    return NextResponse.json(
      { error: 'AI returned an unexpected response format. Please try again.' },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ...profile,
    currentPosition: toUpperCaseText(profile.currentPosition ?? ''),
  });
}
