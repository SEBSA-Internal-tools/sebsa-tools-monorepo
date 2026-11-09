'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/lib/roles';

/**
 * Client-side page guard for pages with no Server Component wrapper (they're 'use client' at
 * the top, so a redirect() in a Server Component isn't an option). Redirects away if the
 * signed-in user's role doesn't pass `allowed`.
 *
 * This is a UX guard only, not the security boundary — RLS policies and the role checks inside
 * each Server Action are what actually enforce access (see docs/04-rbac-security.md). This hook
 * just avoids showing/flashing a page the viewer can't act on.
 */
export function useRoleGate(allowed: (role: UserRole) => boolean, redirectTo = '/dashboard') {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled) return;

      const resolvedRole = (roleRow?.role as UserRole | undefined) ?? 'employee';
      setRole(resolvedRole);
      setChecked(true);

      if (!allowed(resolvedRole)) {
        router.replace(redirectTo);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { role, checked };
}
