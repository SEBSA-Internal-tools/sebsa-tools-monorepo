import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { buildCertificateDownload } from '@/services/assessment-service';

// pdf-lib and the filesystem read of the logo need the Node runtime.
export const runtime = 'nodejs';

const CERTIFICATE_NUMBER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/assessments/certificates/<certificate number> — renders the PDF on demand.
 * Authorisation is Row Level Security: the RLS-bound client only returns a certificate the
 * signed-in user owns (or that a reviewer/admin may see); anything else is a 404, which also
 * avoids confirming that someone else's certificate number exists.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ certificateNumber: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { certificateNumber } = await params;
  if (!CERTIFICATE_NUMBER.test(certificateNumber)) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  const supabase = await createClient();
  const download = await buildCertificateDownload(supabase, createAdminClient(), certificateNumber);
  if (!download) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });

  return new NextResponse(new Uint8Array(download.pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${download.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
