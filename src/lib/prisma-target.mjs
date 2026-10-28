const LOCAL_HOST_NAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function isTruthy(value) {
  return value === "1" || value === "true" || value === "yes";
}

function parseProductionRefs(env) {
  const refs = new Set();
  const configured = env?.PRISMA_PRODUCTION_PROJECT_REF;
  if (configured) {
    for (const ref of String(configured).split(",")) {
      const cleaned = ref.trim().toLowerCase();
      if (cleaned) refs.add(cleaned);
    }
  }
  return refs;
}

function extractProjectRef(parsed) {
  try {
    const username = decodeURIComponent(parsed.username ?? "");
    const userMatch = username.match(/^postgres\.([a-z0-9]{8,})$/i);
    if (userMatch) return userMatch[1].toLowerCase();
  } catch {
    return null;
  }
  const hostMatch = parsed.hostname.toLowerCase().match(/^db\.([a-z0-9]{8,})\.supabase\.co$/);
  return hostMatch ? hostMatch[1] : null;
}

function isSupabaseHost(host) {
  return /\.(supabase\.(com|co)|supabase\.in)$/.test(host) || host === "supabase.com";
}

export function redactDatabaseUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return "(not set)";
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname || "unknown-host";
    const port = parsed.port ? `:${parsed.port}` : "";
    const database = parsed.pathname.replace(/^\//, "") || "(default)";
    return `${parsed.protocol}//***@${host}${port}/${database}`;
  } catch {
    return "(malformed value)";
  }
}

export function classifyDatabaseTarget(value, options = {}) {
  const env = options.env ?? {};

  if (typeof value !== "string" || value.trim() === "") {
    return {
      kind: "missing",
      host: null,
      port: null,
      database: null,
      projectRef: null,
      label: "DATABASE_URL is not set",
    };
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return {
      kind: "malformed",
      host: null,
      port: null,
      database: null,
      projectRef: null,
      label: "DATABASE_URL is not a parsable connection URL",
    };
  }

  const protocol = parsed.protocol.replace(":", "").toLowerCase();
  if (protocol !== "postgres" && protocol !== "postgresql") {
    return {
      kind: "malformed",
      host: null,
      port: null,
      database: null,
      projectRef: null,
      label: `DATABASE_URL uses unsupported protocol "${protocol}"`,
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const port = parsed.port || "5432";
  const database = parsed.pathname.replace(/^\//, "") || "(default)";
  const projectRef = extractProjectRef(parsed);
  const location = `${host}:${port}/${database}`;

  if (LOCAL_HOST_NAMES.has(host) || /^127\./.test(host) || host.endsWith(".localhost")) {
    return {
      kind: "local",
      host,
      port,
      database,
      projectRef,
      label: `local PostgreSQL at ${location}`,
    };
  }

  const knownProductionRefs = parseProductionRefs(env);
  if (projectRef && knownProductionRefs.has(projectRef)) {
    return {
      kind: "production",
      host,
      port,
      database,
      projectRef,
      label: `production database (configured project) at ${location}`,
    };
  }

  if (isSupabaseHost(host)) {
    return {
      kind: "production",
      host,
      port,
      database,
      projectRef,
      label: `Supabase project database at ${location}`,
    };
  }

  return {
    kind: "unknown",
    host,
    port,
    database,
    projectRef,
    label: `unrecognised remote database host at ${location}`,
  };
}

export function describeDatabaseTarget(target) {
  if (!target) return "database target (unclassified)";
  return `database target: ${target.label}`;
}

export function assertSafeDatabaseTarget(options = {}) {
  const { url, mode = "development", env = {} } = options;
  const target = classifyDatabaseTarget(url, { env });

  if (target.kind === "local") {
    return { ok: true, target, mode };
  }

  if (target.kind === "production") {
    if (mode === "production") {
      return { ok: true, target, mode, authorized: true };
    }
    if (isTruthy(env.PRISMA_ALLOW_PRODUCTION)) {
      return { ok: true, target, mode, authorized: true };
    }
    throw new Error(
      `Refusing to connect to a production Supabase database while running in development mode. ${describeDatabaseTarget(
        target
      )}. Point DATABASE_URL at the local development database (for example postgresql://<user>@127.0.0.1:5432/ncc_dev) or set PRISMA_ALLOW_PRODUCTION=1 only for an explicitly authorised operation. The connection string itself is never logged.`
    );
  }

  if (target.kind === "unknown") {
    if (isTruthy(env.PRISMA_ALLOW_UNKNOWN_TARGET)) {
      return { ok: true, target, mode, authorized: true };
    }
    throw new Error(
      `Refusing to connect because the database target cannot be classified safely. ${describeDatabaseTarget(
        target
      )}. Use a local PostgreSQL instance (127.0.0.1, localhost or ::1), a recognised Supabase host, or set PRISMA_ALLOW_UNKNOWN_TARGET=1 to accept an explicitly authorised remote target. The connection string itself is never logged.`
    );
  }

  throw new Error(
    `Refusing to start because ${target.label}. Set DATABASE_URL to a PostgreSQL connection string, for example postgresql://<user>@127.0.0.1:5432/ncc_dev for local development. The connection string itself is never logged.`
  );
}
