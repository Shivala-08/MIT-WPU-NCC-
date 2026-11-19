export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  degraded?: boolean;
}

export interface RateLimitStore {
  name: string;
  hit(
    key: string,
    options: { windowMs: number }
  ): Promise<{ count: number; ttlMs?: number; latencyMs?: number }>;
}

export interface ThrottledLogger {
  reportFailure(scope: string, error: Error): boolean;
  suppressed(): number;
}

export function createRateLimiter(limit: {
  limit: number;
  windowMs: number;
}): (key: string) => RateLimitResult;

export function createStoreLimiter(options: {
  limit: number;
  windowMs: number;
  store: RateLimitStore;
  scope?: string;
  logger?: ThrottledLogger;
}): (key: string) => Promise<RateLimitResult>;

export function createStoreFromEnv(
  env?: Record<string, string | undefined>,
  options?: {
    logger?: ThrottledLogger;
    now?: () => number;
    nodeEnv?: string;
  }
): {
  store: RateLimitStore;
  mode: string;
  explicit: boolean;
  problems: string[];
};

export const checkInLimiter: (
  key: string
) => RateLimitResult | Promise<RateLimitResult>;
export const manualCodeLimiter: (
  key: string
) => RateLimitResult | Promise<RateLimitResult>;
export const manualCodeSessionLimiter: (
  key: string
) => RateLimitResult | Promise<RateLimitResult>;
export const bulkMarkLimiter: (
  key: string
) => RateLimitResult | Promise<RateLimitResult>;

export const INCREMENT_SCRIPT: string;
export const MEMORY_STORE_NAME: string;
export const REDIS_STORE_NAME: string;

export function hashIdentifier(value: string): string;
export function windowIdFor(now: number, windowMs: number): number;
export function secondsUntilWindowEnd(now: number, windowMs: number): number;

export function createMemoryStore(options?: {
  now?: () => number;
}): RateLimitStore & { size(): number };

export interface RedisLikeClient {
  eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown>;
}

export function createRedisStore(options?: {
  client?: RedisLikeClient;
  now?: () => number;
  timeoutMs?: number;
  prefix?: string;
}): RateLimitStore;

export function createThrottledLogger(options?: {
  throttleMs?: number;
  now?: () => number;
  report?: (event: Record<string, unknown>) => void;
}): ThrottledLogger;

export function readStoreConfig(env?: Record<string, string | undefined>): {
  mode: string;
  requested: string | null;
  explicit: boolean;
  url: string | null;
  token: string | null;
  problems: string[];
};

export function createRedisClient(config: {
  url: string;
  token: string;
  timeoutMs?: number;
}): unknown;
