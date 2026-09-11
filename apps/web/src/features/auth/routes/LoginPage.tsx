import { useState, type InputHTMLAttributes } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { SebsaLogo, cn } from '@/components/ui';
import { Button } from '@/components/ui/Button.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { useFieldControlProps } from '@/components/ui/fieldContext.ts';
import { Divider } from '@/components/ui/Card.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import { useSession } from '@/hooks/useSession.ts';
import common from '@/content/common.json';
import content from '@/content/login.json';
import { SessionExpiredNotice } from '../components/SessionExpiredNotice.tsx';
import { useLogin } from '../api/queries.ts';
import { loginDefaults, loginSchema, type LoginInput } from '../domain/loginSchema.ts';

/**
 * Password input with a visibility toggle.
 *
 * Uses `useFieldControlProps` so it inherits the same id and ARIA wiring a
 * plain `Input` would, without `Field` needing to know about the toggle.
 */
function PasswordInput({ placeholder, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [isVisible, setIsVisible] = useState(false);
  const { hasError, ...fieldProps } = useFieldControlProps();

  return (
    <div className="relative">
      <input
        type={isVisible ? 'text' : 'password'}
        placeholder={placeholder}
        autoComplete="current-password"
        className={cn(
          'block w-full rounded-control border bg-surface py-2 pr-11 pl-3 text-sm text-ink-900',
          'placeholder:text-ink-400',
          'transition-colors focus-visible:outline-2 focus-visible:outline-offset-0',
          hasError
            ? 'border-danger focus-visible:outline-danger'
            : 'border-line-strong focus-visible:outline-violet-600',
        )}
        {...fieldProps}
        {...props}
      />
      <button
        type="button"
        onClick={() => setIsVisible((v) => !v)}
        // Outside the tab order: the expected path is label → input → submit.
        // Still reachable with Shift+Tab, and its state is announced.
        tabIndex={-1}
        aria-pressed={isVisible}
        aria-label={isVisible ? content.form.hidePassword : content.form.showPassword}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-control text-ink-400 transition-colors hover:text-ink-700"
      >
        {isVisible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * Ambient shapes behind the brand panel.
 *
 * FOUR elements, down from nine.
 *
 * The previous set — three outlined rings, two rounded squares, three filled
 * dots and two glows — read as a pattern rather than as atmosphere, and several
 * of them tracked straight across the copy column, which is the one thing
 * decoration behind text must not do. Nine shapes is also nine animations
 * compositing forever behind a form the user is trying to fill in.
 *
 * What is left is a two-glow depth field plus two outlined shapes, and every one
 * of them is positioned in the panel's outer gutters: the copy sits in a
 * `max-w-md` column against the left edge, so the right third and the extreme
 * corners are free. Nothing overlaps a word.
 *
 * Purely decorative and `aria-hidden`. `prefers-reduced-motion` stops all of it
 * via the global block in `styles/global.css` — which is what makes ambient
 * motion behind a login form acceptable at all.
 *
 * `e2e/login.spec.ts` asserts, in both directions, that these animate and that
 * every duration is over ten seconds. That is a deliberate negative control
 * against a quicker flourish creeping onto a form; keep any replacement inside
 * it.
 */
function PanelDecoration() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/*
        Two large soft glows carry the depth. Opacity only — a blurred shape that
        moves smears, and at this size it would be the most distracting thing on
        the screen.
      */}
      <span className="absolute -top-40 -left-32 size-[32rem] animate-breathe rounded-full bg-white/15 blur-3xl" />
      <span className="absolute -right-40 -bottom-40 size-[34rem] animate-breathe rounded-full bg-brand-cyan/20 blur-3xl [animation-delay:-6s]" />

      {/*
        Two outlined shapes drift, in the right-hand gutter beside the copy
        column. Negative delays start them at different points in their cycles,
        so they never move in step with each other.
      */}
      <span className="absolute top-[14%] -right-16 size-64 animate-drift-slow rounded-full border border-white/20" />
      <span className="absolute right-[12%] bottom-[16%] size-40 animate-drift-medium rounded-[2.5rem] border border-white/15 [animation-delay:-9s]" />
    </div>
  );
}

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const login = useLogin();
  // Set by the session store when a session times out, rather than read from the
  // URL: a query string survives bookmarking and sharing, and "your session
  // expired" is only true for the person it just happened to.
  const didExpire = useSession((state) => state.didExpire);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: loginDefaults,
    // On blur, not on every keystroke: errors appearing mid-typing read as nagging.
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await login.mutateAsync(values);
      toast.success(interpolate(content.messages.success, { name: user.name }));
      onSignedIn();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : content.messages.invalidCredentials;
      toast.error(message);
    }
  });

  const serverError = login.isError && login.error instanceof ApiError ? login.error.message : null;
  const isBusy = isSubmitting || login.isPending;

  return (
    // `h-dvh` + `overflow-hidden`: a login screen should never scroll. `dvh`
    // rather than `vh` so mobile browser chrome does not create hidden overflow.
    <div className="grid h-dvh overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ------------------------------------------------ brand panel (left) */}
      <section className="relative isolate hidden flex-col justify-between overflow-hidden bg-brand-gradient-deep p-10 text-white lg:flex xl:p-14">
        <PanelDecoration />

        <div className="relative">
          <SebsaLogo height={40} tone="inverse" title="" />
        </div>

        {/*
          The copy column.

          `max-w-md` is what keeps the decoration's gutters clear, so it is
          load-bearing rather than a typographic preference — widening it would
          run the subtitle under the drifting ring on the right.

          Each block arrives on its own short delay. One-shot `reveal-up`, not a
          loop: the panel settles within ~400ms and is then completely still,
          which is the correct amount of movement next to a password field.
        */}
        <div className="relative max-w-md">
          <p className="animate-reveal-up text-[0.7rem] font-semibold tracking-[0.28em] text-white/70 uppercase">
            {content.brandPanel.eyebrow}
          </p>

          {/* `text-white` is required, not decorative. The base layer in
              global.css sets an explicit colour on h1–h4, and an explicit
              declaration beats the inherited white from the section — without
              this the heading renders navy-on-purple. */}
          <h1 className="mt-4 animate-reveal-up font-display text-4xl leading-[1.1] font-extrabold text-white [animation-delay:70ms] xl:text-5xl">
            {content.brandPanel.title}
          </h1>

          <p className="mt-5 max-w-sm animate-reveal-up text-sm leading-relaxed text-white/80 [animation-delay:140ms]">
            {content.brandPanel.subtitle}
          </p>

          {/*
            A hairline above the list, so the three promises read as a distinct
            band rather than as a fourth paragraph. Short and left-aligned — a
            full-width rule across the panel would fight the gradient.
          */}
          <span
            className="mt-9 block h-px w-16 animate-reveal-fade bg-white/40 [animation-delay:200ms]"
            aria-hidden="true"
          />

          <ul className="mt-6 space-y-3.5">
            {content.brandPanel.highlights.map((highlight, index) => (
              <li
                key={highlight}
                className="flex animate-reveal-up items-start gap-3 text-sm text-white/90"
                style={{ animationDelay: `${String(240 + index * 70)}ms` }}
              >
                <span
                  className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/25"
                  aria-hidden="true"
                >
                  <Check className="size-3" />
                </span>
                <span className="leading-6">{highlight}</span>
              </li>
            ))}
          </ul>
        </div>

        {/*
          The panel is a three-row flex with `justify-between`, and this row used
          to be an empty div holding the bottom edge open. Giving it the
          attribution line balances the composition and stops the logo at the top
          reading as the panel's only anchor.
        */}
        <p className="relative animate-reveal-fade text-xs text-white/60 [animation-delay:460ms]">
          {common.app.poweredBy}{' '}
          <span className="font-semibold text-white/80">{common.app.organisation}</span>
        </p>
      </section>

      {/* -------------------------------------------------- sign-in (right) */}
      {/* Scrolls INTERNALLY on a short viewport rather than clipping the submit
          button — a scrollbar on a 500px-tall window beats an unreachable CTA. */}
      <section className="flex flex-col justify-center overflow-y-auto bg-canvas px-5 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-sm animate-reveal-up">
          {/* The gradient panel is hidden below lg, so the brand appears here. */}
          <div className="mb-8 flex justify-center lg:hidden">
            <SebsaLogo height={34} />
          </div>

          {/* Only after a timeout, and it clears itself once read. */}
          {didExpire ? <SessionExpiredNotice /> : null}

          <header>
            <h2 className="font-display text-2xl font-bold text-ink-900">{content.form.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{content.form.subtitle}</p>
          </header>

          <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-7 space-y-4">
            <Field label={content.form.emailLabel} error={errors.email?.message} required>
              {/* No autoFocus: it would jump past the heading before a screen
                  reader has announced it. */}
              <Input
                type="email"
                autoComplete="username"
                placeholder={content.form.emailPlaceholder}
                {...register('email')}
              />
            </Field>

            <Field label={content.form.passwordLabel} error={errors.password?.message} required>
              <PasswordInput
                placeholder={content.form.passwordPlaceholder}
                {...register('password')}
              />
            </Field>

            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                className="size-4 rounded border-line-strong accent-violet-600"
                {...register('remember')}
              />
              {content.form.remember}
            </label>

            {serverError === null ? null : (
              <p
                role="alert"
                className="rounded-control border border-danger/30 bg-danger-surface px-3 py-2 text-sm font-medium text-danger"
              >
                {serverError}
              </p>
            )}

            <Button
              type="submit"
              variant="brand"
              size="lg"
              fullWidth
              isLoading={isBusy}
              loadingLabel={content.form.submitting}
            >
              {content.form.submit}
            </Button>
          </form>

          {/* SSO sits BELOW the credential form and in a secondary style,
              because credentials are the working path in Phase 1 and this
              button is inert. Both flip when Keycloak goes live: SSO becomes
              the primary action and moves above the form. */}
          <Divider label={content.form.dividerLabel} className="my-5" />

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            leadingIcon={<ShieldCheck className="size-4" aria-hidden="true" />}
            onClick={() => toast.info(content.messages.ssoUnavailable)}
          >
            {content.form.ssoButton}
          </Button>

          {/* The password is spelled out in content rather than imported from
              `mocks/`, which application code must not depend on. A test in
              `mocks/credentials.test.ts` asserts the two stay in step. */}
          {/* <p className="mt-7 rounded-control border border-line bg-surface px-3 py-2 text-center text-xs text-ink-500">
            {content.demoHint}
          </p> */}
        </div>
      </section>
    </div>
  );
}
