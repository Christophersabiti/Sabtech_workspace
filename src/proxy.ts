import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/accept-invite'];
const ADMIN_PATHS  = [
  '/admin/users/roles',
  '/admin/users/invitations',
  '/admin/users',
  '/admin/settings/company',
  '/admin/settings/invoice',
  '/admin/settings/branding',
  '/admin/settings/payment-methods',
  '/admin/settings',
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public assets to pass through (no auth needed)
  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo.svg'
  ) {
    return NextResponse.next();
  }

  // Allow public auth pages
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // No session → redirect to login
  if (!session) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only paths → check role in app_users
  if (ADMIN_PATHS.some(p => pathname.startsWith(p))) {
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role')
      .eq('auth_user_id', session.user.id)
      .single();

    const adminRoles = ['super_admin', 'admin'];
    if (!appUser || !adminRoles.includes(appUser.role)) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg).*)',
  ],
};
