/** Anything can be thrown in JS; normalize it to an Error (keeps ApiRequestError as-is). */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
