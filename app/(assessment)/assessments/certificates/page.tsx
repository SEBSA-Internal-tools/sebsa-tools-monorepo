import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getMyOverview } from '@/services/assessment-service';
import { PageWrapper } from '@/app/components/PageWrapper';
import CertificateList from '../CertificateList';
import { History } from 'lucide-react';

export default async function CertificatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = await createClient();
  const { certificates } = await getMyOverview(supabase, user.id);

  return (
    <PageWrapper className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">My Certificates</h2>
      </div>

      <section className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm max-w-3xl">
        <CertificateList
          certificates={certificates}
          emptyText="Pass an assessment to earn a certificate. Issued certificates will appear here."
        />
        <p className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100 text-[11px] font-semibold text-slate-400">
          <History className="w-3.5 h-3.5" />
          Previously issued certificates remain available after a cycle closes.
        </p>
      </section>
    </PageWrapper>
  );
}
