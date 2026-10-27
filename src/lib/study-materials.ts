const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

export type RedirectResolution =
  | { ok: true; url: URL }
  | { ok: false; status: 400 | 403; error: string };

function normalizeHostValue(value: string): string | null {
  let host = value.trim().toLowerCase();

  if (!host) {
    return null;
  }

  if (host.includes("://")) {
    try {
      host = new URL(host).host;
    } catch {
      return null;
    }
  }

  host = host.replace(/\.$/, "");

  if (host.endsWith(":443") || host.endsWith(":80")) {
    host = host.slice(0, host.lastIndexOf(":"));
  }

  return host || null;
}

function getConfiguredOrigins(): URL[] {
  const origins: URL[] = [];

  for (const value of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ]) {
    if (!value) {
      continue;
    }
    try {
      origins.push(new URL(value));
    } catch {
      // ignore invalid origin configuration
    }
  }

  return origins;
}

export function getAllowedHosts(): string[] {
  const hosts = new Set<string>();

  for (const origin of getConfiguredOrigins()) {
    const normalized = normalizeHostValue(origin.host);
    if (normalized) {
      hosts.add(normalized);
    }
  }

  const configured = process.env.STUDY_MATERIAL_ALLOWED_HOSTS;
  if (configured) {
    for (const entry of configured.split(",")) {
      const normalized = normalizeHostValue(entry);
      if (normalized) {
        hosts.add(normalized);
      }
    }
  }

  return [...hosts];
}

export function getSiteOrigin(requestUrl: string): string {
  for (const value of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
  ]) {
    if (!value) {
      continue;
    }
    try {
      return new URL(value).origin;
    } catch {
      // ignore invalid origin configuration
    }
  }

  try {
    return new URL(requestUrl).origin;
  } catch {
    return "http://localhost";
  }
}

export function resolveStudyMaterialUrl(
  fileUrl: string,
  requestUrl: string
): RedirectResolution {
  const value = (fileUrl ?? "").trim();

  if (!value) {
    return { ok: false, status: 400, error: "Material has no download URL" };
  }

  if (value.startsWith("/")) {
    if (!value.startsWith("/study/")) {
      return {
        ok: false,
        status: 400,
        error: "Relative download paths must point to /study/",
      };
    }

    try {
      return {
        ok: true,
        url: new URL(value, getSiteOrigin(requestUrl)),
      };
    } catch {
      return { ok: false, status: 400, error: "Invalid download URL" };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, status: 400, error: "Invalid download URL" };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      status: 400,
      error: "Download URLs must not contain credentials",
    };
  }

  const isLocal = LOCAL_HOSTS.includes(parsed.hostname.toLowerCase());
  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    return {
      ok: false,
      status: 400,
      error: "Download URL must use HTTPS",
    };
  }

  const allowedHosts = getAllowedHosts();
  if (!allowedHosts.includes(normalizeHostValue(parsed.host) ?? "")) {
    return {
      ok: false,
      status: 403,
      error: "Download destination host is not approved",
    };
  }

  return { ok: true, url: parsed };
}
