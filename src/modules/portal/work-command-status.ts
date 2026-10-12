export function workCommandHttpStatus(error: unknown): 403 | 409 {
  return error && typeof error === "object" && "code" in error && error.code === "42501" ? 403 : 409;
}
