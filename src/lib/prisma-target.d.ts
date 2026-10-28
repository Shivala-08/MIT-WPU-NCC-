export type DatabaseTargetKind =
  | "local"
  | "production"
  | "unknown"
  | "missing"
  | "malformed";

export interface DatabaseTarget {
  kind: DatabaseTargetKind;
  host: string | null;
  port: string | null;
  database: string | null;
  projectRef: string | null;
  label: string;
}

export interface DatabaseTargetOptions {
  env?: Record<string, string | undefined>;
}

export interface SafeTargetOptions extends DatabaseTargetOptions {
  url: string | undefined;
  mode?: "development" | "production";
}

export interface SafeTargetResult {
  ok: true;
  target: DatabaseTarget;
  mode: "development" | "production";
  authorized?: boolean;
}

export function redactDatabaseUrl(value: string | undefined): string;
export function classifyDatabaseTarget(
  value: string | undefined,
  options?: DatabaseTargetOptions
): DatabaseTarget;
export function describeDatabaseTarget(target: DatabaseTarget | null | undefined): string;
export function assertSafeDatabaseTarget(options: SafeTargetOptions): SafeTargetResult;
