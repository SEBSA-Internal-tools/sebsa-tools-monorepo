import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/queryClient';
import { useSessionReset } from './useSessionReset';

function SessionReset({ children }: { children: ReactNode }) {
  useSessionReset();
  return <>{children}</>;
}

export const AppProviders = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionReset>{children}</SessionReset>
    </QueryClientProvider>
  );
};
