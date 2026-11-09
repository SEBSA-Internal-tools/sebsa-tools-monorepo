/**
 * Client-side (browser) text extraction from an uploaded CV file. Shared by the admin Upload
 * page and the self-service /onboarding page — both need the same PDF/DOCX/TXT -> plain text
 * step before sending the text to /api/parse-cv.
 */

async function extractTextFromTxt(file: File): Promise<string> {
  return file.text();
}

async function extractTextFromDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  // Use the bundled worker via a CDN pointing to the same version
  const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str as string)
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n');
}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return extractTextFromPdf(file);
  if (name.endsWith('.docx')) return extractTextFromDocx(file);
  return extractTextFromTxt(file);
}
