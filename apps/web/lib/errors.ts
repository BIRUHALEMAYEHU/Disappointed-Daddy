/**
 * Errors in the Messages API's JSON shape, so the Anthropic SDK in the CLI raises its usual typed errors
 * (AuthenticationError, RateLimitError, ...) and the CLI can explain them.
 */
export function apiError(status: number, type: string, message: string) {
  return Response.json({ type: "error", error: { type, message } }, { status });
}
