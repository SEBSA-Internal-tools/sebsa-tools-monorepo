import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';

export interface CertificateData {
  employeeName: string;
  employeeEmail: string;
  score: number;
  attemptNumber: number;
  dateCompleted: Date;
  certificateNumber: string;
}

// Official supplied template, measured on its 1243 x 885 reference canvas. The layout is
// deliberately independent of employee details and cycle labels so it never reflows.
const WIDTH = 842;
const HEIGHT = 595;
const sx = (x: number) => (x * WIDTH) / 1243;
const sy = (y: number) => (y * HEIGHT) / 885;
const NAVY = rgb(12 / 255, 45 / 255, 98 / 255);
const BLACK = rgb(0, 0, 0);
const ID_BLUE = rgb(65 / 255, 105 / 255, 165 / 255);

/**
 * Renders the completion certificate. Issuance is guarded by the persisted passing rule in the
 * assessment service — this renderer must not invent its own pass threshold.
 */
export async function generateCertificatePdf(data: CertificateData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([WIDTH, HEIGHT]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 0, width: WIDTH, height: HEIGHT, color: rgb(1, 1, 1) });
  page.drawRectangle({
    x: sx(31), y: HEIGHT - sy(857), width: sx(1190), height: sy(824),
    borderColor: NAVY, borderWidth: sx(8),
  });

  // The logo already includes its tagline and transparent padding; embed it once as supplied.
  const logo = await pdfDoc.embedPng(
    fs.readFileSync(path.join(process.cwd(), 'public', 'images', 'sebsa-logo.png'))
  );
  const logoWidth = sx(318);
  const logoHeight = (logo.height * logoWidth) / logo.width;
  page.drawImage(logo, { x: sx(467), y: HEIGHT - sy(21) - logoHeight, width: logoWidth, height: logoHeight });

  function centered(text: string, baseline: number, referenceSize: number, font: PDFFont, color = NAVY) {
    let size = sx(referenceSize);
    const availableWidth = WIDTH - sx(140);
    const textWidth = font.widthOfTextAtSize(text, size);
    if (textWidth > availableWidth) size *= availableWidth / textWidth;
    page.drawText(text, {
      x: sx(626) - font.widthOfTextAtSize(text, size) / 2,
      y: HEIGHT - sy(baseline), size, font, color,
    });
  }

  centered('ASSESSMENT COMPLETION CERTIFICATE', 282, 32, bold);
  centered('This certificate is presented to', 330, 16, regular, BLACK);
  centered(data.employeeName, 377, 30, bold);
  centered('for completing the', 418, 16, regular, BLACK);
  centered('EMPLOYEE AWARENESS ASSESSMENT', 456, 22, bold);

  const date = data.dateCompleted.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Colombo',
  });
  const rows: [string, string][] = [
    ['Employee Email:', data.employeeEmail],
    ['Assessment Result:', 'Pass'],
    ['Score:', `${data.score}/10 (${Math.round((data.score / 10) * 100)}%)`],
    ['Attempt Number:', String(data.attemptNumber)],
    ['Completion Date:', date],
  ];
  const rowSize = sx(14);
  rows.forEach(([label, value], index) => {
    const y = HEIGHT - sy(497 + index * 26);
    page.drawText(label, { x: sx(595) - bold.widthOfTextAtSize(label, rowSize), y, size: rowSize, font: bold, color: BLACK });
    const availableWidth = sx(1160 - 612);
    const valueWidth = regular.widthOfTextAtSize(value, rowSize);
    const valueSize = valueWidth > availableWidth ? (rowSize * availableWidth) / valueWidth : rowSize;
    page.drawText(value, { x: sx(612), y, size: valueSize, font: regular, color: BLACK });
  });

  centered(`Certificate ID: ${data.certificateNumber}`, 633, 11, regular, ID_BLUE);
  centered('Human Resources Department', 819, 16, regular);
  return Buffer.from(await pdfDoc.save());
}
