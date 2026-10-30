import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/**
 * Storage for profile photos.
 *
 * Profile photos are private: they are never written to `public/` and they are
 * never served directly by the storage provider. The browser only ever sees
 * them through the authorised photo routes of the application.
 *
 * Two back ends are supported:
 *
 *   * `supabase` - a private Supabase Storage bucket. The service role key is
 *     only read on the server and is never sent to the browser.
 *   * `local`   - a development only folder outside `public/`. It is meant for
 *     local work; the file system of a serverless deployment is ephemeral, so
 *     production has to use the Supabase back end.
 */

export const PROFILE_PHOTO_BUCKET_DEFAULT = "profile-photos";

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
function resolveSupabaseUrl(env) {
  return env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
function resolveServiceRoleKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function resolveLocalDirectory(env) {
  const configured = env.PROFILE_PHOTO_LOCAL_DIR;

  if (configured && configured.trim().length > 0) {
    return resolve(configured.trim());
  }

  return resolve(process.cwd(), ".local-storage", "profile-photos");
}

/**
 * @param {string} baseDirectory
 * @param {string} path
 * @returns {string}
 */
function resolveLocalPath(baseDirectory, path) {
  const target = resolve(baseDirectory, path);

  if (target !== baseDirectory && !target.startsWith(baseDirectory + sep)) {
    throw new Error("The storage path is outside the profile photo folder");
  }

  return target;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<{ ok: true, storage: any, backend: string } | { ok: false, error: string }>}
 */
export async function createProfilePhotoStorage(env = process.env) {
  const requested = (env.PROFILE_PHOTO_STORAGE ?? "").trim().toLowerCase();
  const bucket = (env.PROFILE_PHOTO_BUCKET ?? "").trim() || PROFILE_PHOTO_BUCKET_DEFAULT;
  const url = resolveSupabaseUrl(env);
  const serviceRoleKey = resolveServiceRoleKey(env);

  // The Supabase back end is opt in. A development machine that happens to
  // hold the project credentials must never write to the production bucket by
  // accident.
  const wantsSupabase = requested === "supabase";

  if (requested === "local") {
    return {
      ok: true,
      backend: "local",
      storage: createLocalStorage(resolveLocalDirectory(env)),
    };
  }

  if (!wantsSupabase) {
    if (requested !== "") {
      return {
        ok: false,
        error: `PROFILE_PHOTO_STORAGE must be "supabase" or "local", got "${requested}"`,
      };
    }

    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        error:
          "Profile photo storage is not configured for this deployment. Set PROFILE_PHOTO_STORAGE=supabase, the bucket name and the matching credentials.",
      };
    }

    return {
      ok: true,
      backend: "local",
      storage: createLocalStorage(resolveLocalDirectory(env)),
    };
  }

  if (!url || !serviceRoleKey) {
    return {
      ok: false,
      error:
        "Profile photo storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  try {
    const { createClient } = await import("@supabase/storage-js");
    const client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    return {
      ok: true,
      backend: "supabase",
      storage: createSupabaseStorage(client, bucket),
    };
  } catch (error) {
    console.error("Failed to initialise the profile photo storage:", error);
    return {
      ok: false,
      error: "The profile photo storage could not be initialised",
    };
  }
}

/**
 * @param {any} client
 * @param {string} bucket
 * @returns {any}
 */
function createSupabaseStorage(client, bucket) {
  return {
    async put(path, bytes, contentType) {
      const { error } = await client.from(bucket).upload(path, bytes, {
        contentType,
        upsert: false,
        cacheControl: "3600",
      });

      if (error) {
        throw new Error(`The photo could not be stored: ${error.message}`);
      }

      return true;
    },

    async remove(path) {
      if (!path) {
        return true;
      }

      const { error } = await client.from(bucket).remove([path]);

      if (error) {
        throw new Error(`The photo could not be removed: ${error.message}`);
      }

      return true;
    },

    async read(path) {
      const { data, error } = await client.from(bucket).download(path);

      if (error || !data) {
        return { ok: false };
      }

      const bytes = new Uint8Array(await data.arrayBuffer());

      return { ok: true, bytes, contentType: "image/webp" };
    },
  };
}

/**
 * @param {string} baseDirectory
 * @returns {any}
 */
function createLocalStorage(baseDirectory) {
  return {
    async put(path, bytes) {
      const target = resolveLocalPath(baseDirectory, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return true;
    },

    async remove(path) {
      if (!path) {
        return true;
      }

      const target = resolveLocalPath(baseDirectory, path);
      await rm(target, { force: true });
      return true;
    },

    async read(path) {
      try {
        const target = resolveLocalPath(baseDirectory, path);
        const bytes = new Uint8Array(await readFile(target));
        return { ok: true, bytes, contentType: "image/webp" };
      } catch {
        return { ok: false };
      }
    },
  };
}

/**
 * The development folder that stores the profile photos locally.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function getLocalPhotoDirectory(env = process.env) {
  return resolveLocalDirectory(env);
}

/**
 * The path of the local folder relative to the project root, used by the
 * `.gitignore`.
 */
export const LOCAL_PHOTO_DIRECTORY_NAME = ".local-storage";
