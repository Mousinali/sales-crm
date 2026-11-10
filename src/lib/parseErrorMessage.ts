// Shared by every list/form view's fetch error handling: reads the API's
// `{ error: string }` body, with room for a view to override specific
// status codes with a friendlier message (e.g. 404 -> "That lead no longer
// exists.") before falling back to the server's own message, then to
// `fallback` if the body couldn't be parsed at all.
export async function parseErrorMessage(
  response: Response,
  fallback: string,
  statusMessages?: Partial<Record<number, string>>,
): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") {
      return statusMessages?.[response.status] ?? body.error;
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}
