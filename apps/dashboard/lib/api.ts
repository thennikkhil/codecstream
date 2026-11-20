export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: string } & Record<string, unknown>,
  ) {
    super(body.error ?? `Request failed (${status})`);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  const responseBody: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorBody =
      typeof responseBody === "object" && responseBody !== null && !Array.isArray(responseBody)
        ? (responseBody as { error?: string } & Record<string, unknown>)
        : {};
    throw new ApiError(res.status, errorBody);
  }
  return responseBody as T;
}
