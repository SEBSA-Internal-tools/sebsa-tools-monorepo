import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initialiseSession } from '@/hooks/useSession';
import { App } from './app/App';
import './styles/index.css';

async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    const { startMockApi, ensureMockApiActive } = await import('@/mocks/browser');
    await startMockApi();
    const { setDetachedRecovery } = await import('@/lib/apiClient');
    setDetachedRecovery(ensureMockApiActive);
  }

  initialiseSession();

  const container = document.getElementById('root');
  if (!container) throw new Error('Root element #root was not found in index.html');

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
