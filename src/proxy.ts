import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes reachable without a session. Everything else needs one. */
const PUBLIC_PATHS = ["/entrar", "/criar-conta", "/offline"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Nothing may run between creating the client and this call: it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // getClaims() can rotate the session (refresh token rotation is on), which queues a
  // new Set-Cookie into `response` above. Every redirect is built from `response`
  // instead of a bare NextResponse.redirect(), so a rotated cookie is never silently
  // dropped on the way out, whatever the exact rotation timing turns out to be.
  function redirectTo(path: string): NextResponse {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  if (!userId && !isPublic) {
    return redirectTo("/entrar");
  }

  // Approved or not is decided by the database in the page layouts, not here.
  if (userId && (pathname === "/entrar" || pathname === "/criar-conta")) {
    // A JWT can also outlive its profile row: a local `db reset` wipes auth.users but
    // a browser can still hold an old, signature-valid token, and in production a
    // still-live access token can outlast the moment an admin deletes the account.
    // Without this check that ghost session would bounce forever between here and
    // the page layout's own "no profile -> /entrar" redirect. Clearing it here,
    // instead of just redirecting, is what breaks that loop too.
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      return response;
    }

    return redirectTo("/");
  }

  // A stale authenticated page would be the worst bug this app could have:
  // a list from five minutes ago looks exactly like the current one.
  if (userId) {
    response.headers.set("Cache-Control", "no-store, must-revalidate");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|api/cron).*)",
  ],
};
