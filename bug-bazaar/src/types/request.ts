// Request status as a discriminated union.
//
// With separate `isLoading`, `error` and `data` fields, 2^3 combinations are
// representable, and most are nonsense ("loading with an error and data").
// Here each status carries exactly the fields that make sense for it, so:
//   - `data` only exists when status is "success"
//   - `error` only exists when status is "error"
// TypeScript forces a status check before either can be read.

export type RequestState<T, E = Error> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: E };

export type RequestStatus = RequestState<unknown>["status"];

/** Constructors keep call sites short and always produce a valid state. */
export const requestState = {
  idle: (): { status: "idle" } => ({ status: "idle" }),
  loading: (): { status: "loading" } => ({ status: "loading" }),
  success: <T>(data: T): { status: "success"; data: T } => ({ status: "success", data }),
  error: <E>(error: E): { status: "error"; error: E } => ({ status: "error", error }),
};
