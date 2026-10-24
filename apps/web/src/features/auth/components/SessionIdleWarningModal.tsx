import { Clock } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Button } from '@/components/ui/Button.tsx';

interface SessionIdleWarningModalProps {
  open: boolean;
  remainingSeconds: number;
  onContinue: () => void;
  onSignOut: () => void;
}

export function SessionIdleWarningModal({
  open,
  remainingSeconds,
  onContinue,
  onSignOut,
}: SessionIdleWarningModalProps) {
  const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onContinue();
      }}
      title="Your session will expire due to inactivity."
      icon={<Clock className="size-5 text-warning" aria-hidden="true" />}
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-3">
          <Button variant="secondary" onClick={onSignOut}>
            Sign Out
          </Button>
          <Button variant="primary" onClick={onContinue}>
            Continue Session
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm text-ink-700">
        <p>
          You will be signed out in {minutes} minute{minutes === 1 ? '' : 's'}. Continue working to keep your session active.
        </p>
      </div>
    </Dialog>
  );
}
