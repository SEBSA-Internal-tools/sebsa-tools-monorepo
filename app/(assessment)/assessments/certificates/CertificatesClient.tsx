'use client';

import { useEffect, useState } from 'react';
import type { AssessmentCertificate } from '@/types/assessment';
import type { PaginatedResult } from '@/lib/pagination';
import { Pagination } from '@/app/components/Pagination';
import CertificateList from '../CertificateList';
import { listMyCertificatesPageAction } from '../actions';

export default function CertificatesClient({ initialPage }: { initialPage: PaginatedResult<AssessmentCertificate> }) {
  const [result, setResult] = useState(initialPage);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState(initialPage.pageSize);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    listMyCertificatesPageAction(page, pageSize).then(setResult).finally(() => setLoading(false));
  }, [page, pageSize]);
  return <>
    <CertificateList certificates={result.items} emptyText="Pass an assessment to earn a certificate. Issued certificates will appear here." />
    <Pagination page={page} pageSize={pageSize} total={result.total} disabled={loading}
      onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
  </>;
}
