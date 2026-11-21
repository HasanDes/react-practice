// Week 1 board types (replaced by the product features in Day 2).

export const SEVERITIES = ["Low", "Medium", "High"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Bug = {
  id: number;
  title: string;
  severity: Severity;
};

export type NewBug = Omit<Bug, "id">;

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}
