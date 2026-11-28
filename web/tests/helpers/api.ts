// Shared by the route tests. The test file replaces better-auth's session lookup with `session` (see its vi.mock calls);
// everything after that lookup, including membership, origin checks and workspace scoping, is the real code.
export type Session = null | { user: { id: string; name: string; email: string }; session: { activeOrganizationId: string | null } };

export const sessionFor = (userId: string, workspaceId: string | null): Session => ({
  user: { id: userId, name: "Naledi", email: `${userId}@example.test` },
  session: { activeOrganizationId: workspaceId },
});

type Handler = (req: Request, ctx: { params: Promise<never> }) => Promise<Response>;

/** Calls a route handler the way Next.js does. Writes carry a same-origin Origin unless `origin` says otherwise. */
export async function call(handler: unknown, method: string, path: string, o: { params?: Record<string, string>; json?: unknown; body?: BodyInit; headers?: Record<string, string>; origin?: string | null } = {}) {
  const headers = new Headers(o.headers);
  const origin = o.origin === undefined ? "http://localhost" : o.origin;
  if (origin && method !== "GET") headers.set("origin", origin);
  if (o.json !== undefined) headers.set("content-type", "application/json");
  const res = await (handler as Handler)(
    new Request(`http://localhost${path}`, { method, headers, body: o.json !== undefined ? JSON.stringify(o.json) : o.body }),
    { params: Promise.resolve((o.params ?? {}) as never) },
  );
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try { data = text ? (JSON.parse(text) as Record<string, unknown>) : null; } catch { data = null; }
  return { status: res.status, data: data as never as Record<string, never> | null, text };
}
