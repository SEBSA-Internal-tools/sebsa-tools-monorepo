import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { Skeleton } from '@/components/common/Skeleton.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { interpolate } from '@/lib/formatters.ts';
import { AuthLayout } from '@/components/common/AuthLayout.tsx';
import { expiredState } from './navigation.ts';
import { setPassword, validateToken } from '../api/localAuthApi.ts';
import { LocalAuthError, type LinkPurpose } from '../api/types.ts';
import { AuthCard, CardHeading, PanelCopy } from '../components/AuthParts.tsx';
import { PasswordForm } from '../components/PasswordForm.tsx';
import { LOCAL_AUTH_ROUTES, SUCCESS_REDIRECT_MS } from '../config.ts';
import { TIPS, setPasswordCopy, setPassword as copy } from '../content.ts';
import type { RuleCode } from '../domain/passwordRules.ts';
import { useDocumentTitle, useFocusOnChange, useNoReferrer } from '../hooks/useAuthScreen.ts';
import { captureTokenFromLocation, clearToken } from '../lib/tokenStore.ts';

type Phase =
  | { name: 'checking' }
  | { name: 'ready'; purpose: LinkPurpose; expiresAt: string }
  | { name: 'success'; purpose: LinkPurpose }
  | { name: 'unreachable' };

/** The server's `expiresAt` in the user's local time, or null if it is missing or unreadable. */
function formatLocal(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function messageFor(error: unknown): string {
  if (error instanceof LocalAuthError) {
    switch (error.code) {
      case 'PASSWORD_POLICY':
      case 'PASSWORD_PERSONAL':
      case 'RATE_LIMITED':
        return copy.errors[error.code];
      default:
        break;
    }
  }
  return copy.errors.GENERIC;
}

/**
 * /set-password — one screen for both the invite link and the forgot-password
 * link. `validateToken` says which it is, and the wording follows.
 */
export function SetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ name: 'checking' });
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedRules, setFailedRules] = useState<readonly RuleCode[]>([]);
  const [attempt, setAttempt] = useState(0);
  // Held in a ref so the submit handler reads it without it being render state.
  const tokenRef = useRef<string | null>(null);
  const redirectTimer = useRef<number | null>(null);

  const text = setPasswordCopy;
  const title =
    phase.name === 'success'
      ? text.successTitle
      : phase.name === 'checking'
        ? copy.checkingTitle
        : text.title;

  useDocumentTitle(title);
  useNoReferrer();
  const headingRef = useFocusOnChange<HTMLHeadingElement>(phase.name);

  const goToExpired = useCallback(
    (reason: 'expired' | 'invalid', linkPurpose: LinkPurpose | undefined, token: string | null) => {
      void navigate(LOCAL_AUTH_ROUTES.linkExpired, {
        replace: true,
        state: expiredState({ reason, purpose: linkPurpose, token }),
      });
    },
    [navigate],
  );

  // Read the token out of the address bar once, then check it. Validating never
  // spends the token, so running this twice under StrictMode is harmless.
  useEffect(() => {
    const token = captureTokenFromLocation();
    tokenRef.current = token;
    if (token === null) {
      goToExpired('invalid', undefined, null);
      return;
    }

    let cancelled = false;
    validateToken(token)
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'valid') {
          setPhase({
            name: 'ready',
            purpose: result.purpose,
            expiresAt: result.expiresAt,
          });
        } else if (result.status === 'expired') {
          goToExpired('expired', result.purpose, token);
        } else {
          goToExpired('invalid', undefined, token);
        }
      })
      .catch(() => {
        if (!cancelled) setPhase({ name: 'unreachable' });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, goToExpired]);

  // Cancel a pending redirect if the user leaves first.
  useEffect(
    () => () => {
      if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
    },
    [],
  );

  const goToSignIn = useCallback(() => {
    if (redirectTimer.current !== null) {
      window.clearTimeout(redirectTimer.current);
      redirectTimer.current = null;
    }
    void navigate(`${LOCAL_AUTH_ROUTES.login}?reason=password-saved`, { replace: true });
  }, [navigate]);

  async function handleSubmit(newPassword: string): Promise<void> {
    const token = tokenRef.current;
    if (token === null || phase.name !== 'ready') return;

    setSaving(true);
    setError(null);
    setFailedRules([]);
    try {
      await setPassword(token, newPassword);
      clearToken();
      tokenRef.current = null;
      setPhase({ name: 'success', purpose: phase.purpose });
      redirectTimer.current = window.setTimeout(goToSignIn, SUCCESS_REDIRECT_MS);
    } catch (cause) {
      if (cause instanceof LocalAuthError && cause.code === 'TOKEN_EXPIRED') {
        goToExpired('expired', phase.purpose, token);
      } else if (cause instanceof LocalAuthError && cause.code === 'TOKEN_INVALID') {
        goToExpired('invalid', undefined, token);
      } else {
        if (cause instanceof LocalAuthError && cause.code === 'PASSWORD_POLICY') {
          setFailedRules(cause.failedRules);
        }
        setError(messageFor(cause));
      }
    } finally {
      setSaving(false);
    }
  }

  const leftCopy = text;
  // Shown only when the server gave a readable expiry; nothing is assumed.
  const expiresAtLocal = phase.name === 'ready' ? formatLocal(phase.expiresAt) : null;
  const expiryNote =
    expiresAtLocal === null
      ? undefined
      : interpolate(copy.expiryNote, { expiresAt: expiresAtLocal });

  return (
    <AuthLayout
      split="900"
      wide
      leftPanel={
        <PanelCopy
          heading={leftCopy.leftHeading}
          text={leftCopy.leftText}
          tips={TIPS}
          note={expiryNote}
        />
      }
      compactHeader={{ heading: leftCopy.leftHeading, text: leftCopy.leftText }}
    >
      <AuthCard>
        {phase.name === 'checking' ? (
          <div role="status" aria-busy="true" aria-live="polite">
            <CardHeading
              title={copy.checkingTitle}
              subtitle={copy.checkingText}
              headingRef={headingRef}
            />
            <div className="space-y-4" aria-hidden="true">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
        ) : null}

        {phase.name === 'unreachable' ? (
          <div>
            <CardHeading title={copy.checkingTitle} headingRef={headingRef} />
            <Alert tone="danger">{copy.validateFailed}</Alert>
            <Button
              className="mt-5"
              variant="brand"
              size="lg"
              fullWidth
              onClick={() => {
                setPhase({ name: 'checking' });
                setAttempt((count) => count + 1);
              }}
            >
              {copy.retry}
            </Button>
          </div>
        ) : null}

        {phase.name === 'ready' ? (
          <div>
            <CardHeading
              title={text.title}
              icon={<KeyRound className="size-5" />}
              headingRef={headingRef}
            />
            <PasswordForm
              submitLabel={text.button}
              isSaving={isSaving}
              error={error}
              serverFailedRules={failedRules}
              onSubmit={handleSubmit}
            />
            {/* Narrow screens have no panel to carry this. */}
            {expiryNote === undefined ? null : (
              <p className="mt-4 text-center text-xs leading-relaxed text-ink-500 min-[900px]:hidden">
                {expiryNote}
              </p>
            )}
          </div>
        ) : null}

        {phase.name === 'success' ? (
          <div role="status" aria-live="polite" className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-surface text-success">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </span>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="mt-5 font-display text-2xl font-bold text-ink-900 focus:outline-none"
            >
              {text.successTitle}
            </h2>
            <p className="mt-2 text-sm text-ink-500">{copy.successText}</p>
            <Button className="mt-6" variant="brand" size="lg" fullWidth onClick={goToSignIn}>
              {copy.successAction}
            </Button>
          </div>
        ) : null}
      </AuthCard>
    </AuthLayout>
  );
}
