export const AUDIT_REDACTED: string;
export const AUDIT_REFERENCE_PREFIX: string;
export const AUDIT_HASH_KEY_MIN_LENGTH: number;
export const AUDIT_HASH_KEY_DEDICATION_NAMES: readonly string[];

export function isProductionEnvironment(
  env?: Record<string, string | undefined>
): boolean;

export function auditHashKey(
  env?: Record<string, string | undefined>
): string | null;

export function productionAuditHashKey(
  env?: Record<string, string | undefined>
): string;

export function assertAuditHashKey(
  env?: Record<string, string | undefined>
): void;

export function emailReference(
  value: unknown,
  env?: Record<string, string | undefined>
): string;

export function maskIdentifier(value: unknown): string;

export function reduceToYear(value: unknown): string;

export function redactFreeText(
  value: unknown,
  env?: Record<string, string | undefined>
): string;

export function redactAuditPayload(
  payload: unknown,
  env?: Record<string, string | undefined>
): Record<string, unknown> | null;

export function redactAuditEvent(
  event: {
    action: string;
    entity: string;
    entityId?: string | null;
    oldData?: unknown;
    newData?: unknown;
  },
  env?: Record<string, string | undefined>
): {
  action: string;
  entity: string;
  entityId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
};
