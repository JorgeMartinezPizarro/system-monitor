/**
 * Nextcloud session check, shared by proxy.ts (pages) and the report API.
 *
 * Fail-closed: every request must carry a session that NEXTCLOUD_URL accepts, of a user in the Nextcloud group
 * MONITOR_GROUP (default "admin"): an ordinary account of that Nextcloud is not enough. The only way to switch it off is
 * MONITOR_AUTH=off at runtime (local development: .env.development). It is read from process.env on each call
 * and deliberately not a NEXT_PUBLIC_ variable: those are inlined by `next build`, so a value present at build
 * time would be baked into the image and ignore the container's environment.
 */
export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export class AuthError extends Error {}

export function authDisabled(): boolean {
  return process.env["MONITOR_AUTH"] === "off";
}

const CACHE_TTL = 60_000;
const CACHE_MAX = 500;
const userCache = new Map<string, { user: AuthUser; expires: number }>();

function cacheSet(cookie: string, user: AuthUser, now: number) {
  if (userCache.size >= CACHE_MAX) {
    for (const [k, v] of userCache) if (v.expires <= now) userCache.delete(k);
    if (userCache.size >= CACHE_MAX) userCache.clear();
  }
  userCache.set(cookie, { user, expires: now + CACHE_TTL });
}

type NextcloudUserPayload = {
  ocs?: {
    data?: {
      id?: string | number;
      displayname?: string;
      email?: string;
      groups?: unknown;
    };
  };
};

function requiredGroup(): string {
  return process.env["MONITOR_GROUP"] || "admin";
}

function parseNextcloudUser(payload: unknown): AuthUser {
  const data = (payload as NextcloudUserPayload)?.ocs?.data;

  const id = data?.id != null ? String(data.id).trim() : "";
  if (!id) {
    throw new AuthError("Invalid user profile");
  }

  const groups = Array.isArray(data?.groups) ? data.groups.map(String) : [];
  if (!groups.includes(requiredGroup())) {
    throw new AuthError(`User ${id} is not in group ${requiredGroup()}`);
  }

  return {
    id,
    name: data?.displayname?.trim() || data?.email?.trim() || id,
    email: data?.email?.trim() || id,
  };
}

async function fetchNextcloudUser(cookie: string): Promise<Response> {
  const base = process.env["NEXTCLOUD_URL"];
  if (!base) throw new AuthError("NEXTCLOUD_URL is not set");

  return fetch(`${base}/ocs/v2.php/cloud/user?format=json`, {
    headers: {
      cookie,
      Accept: "application/json",
      "OCS-APIRequest": "true",
    },
    // an expired session answers with a redirect to the login page: that is a rejection, not something to follow
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
}

/** Returns the Nextcloud user of the request, or throws AuthError. */
export async function requireAuth(request: Request): Promise<AuthUser> {
  const cookie = request.headers.get("cookie") || "";

  if (!cookie) {
    throw new AuthError("No session cookie");
  }

  const cached = userCache.get(cookie);
  const now = Date.now();

  if (cached && cached.expires > now) {
    return cached.user;
  }

  let user: AuthUser;
  try {
    const res = await fetchNextcloudUser(cookie);
    if (res.status !== 200) {
      throw new AuthError(`Nextcloud rejected the session (HTTP ${res.status})`);
    }
    user = parseNextcloudUser(await res.json());
  } catch (err) {
    throw err instanceof AuthError ? err : new AuthError(`Nextcloud check failed: ${String(err)}`);
  }

  // cache corto por cookie (no token)
  cacheSet(cookie, user, now);

  return user;
}

/** Where to send a browser without a valid session: the Nextcloud login, back to the monitor afterwards. */
export function loginUrl(): string {
  const base = process.env["NEXTCLOUD_URL"] || "";
  return `${base}/login?redirect_url=${encodeURIComponent("/bookmarks/pages/monitor")}`;
}
