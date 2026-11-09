import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// /auth/callback is deliberately excluded — it must stay publicly reachable since it's the one
// establishing the session (invite/magic links land here before the user has ever logged in).
const PROTECTED_PREFIXES = ['/dashboard', '/repository', '/upload', '/generate', '/settings', '/onboarding', '/update-profile', '/my-profile', '/review', '/activity', '/auth/set-password', '/assessments'];

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // A signed-in user is normally sent on to the dashboard, but not when /login carries an error:
  // otherwise a failed sign-in (e.g. Microsoft) is silently hidden behind the previous session.
  if ((pathname === '/login' || pathname === '/signup') && user && !request.nextUrl.searchParams.has('error')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
