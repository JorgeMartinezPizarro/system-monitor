import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthError, authDisabled, loginUrl, requireAuth } from '@/app/lib/auth';

/**
 * Pages require a valid Nextcloud session (see app/lib/auth.ts). nginx only checks that a cookie named
 * nc_session_id exists; the real check is here. The report API does its own check, so data never depends on
 * this file alone.
 */
export async function proxy(request: NextRequest) {
  if (authDisabled()) {
    return NextResponse.next();
  }

  try {
    await requireAuth(request);
    return NextResponse.next();
  } catch (err) {
    if (!(err instanceof AuthError)) console.error(err);
    else console.log(`auth: ${err.message}`);
    return NextResponse.redirect(loginUrl());
  }
}

export const config = {
  matcher: ['/pages/:path*'],
};
