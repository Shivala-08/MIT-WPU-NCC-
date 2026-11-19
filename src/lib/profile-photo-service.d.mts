export type PhotoStorage = {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<boolean>;
  remove(path: string): Promise<boolean>;
};

export type PhotoProcessor = (bytes: Uint8Array) => Promise<{
  photo: Uint8Array;
  thumbnail: Uint8Array;
  width: number;
  height: number;
}>;

export type PhotoResult =
  | { ok: true; width: number; height: number; alreadyEmpty?: boolean }
  | { ok: false; statusCode: number; error: string; code?: string };

export function replaceProfilePhoto(input: {
  db: unknown;
  storage: PhotoStorage;
  processor: PhotoProcessor;
  userId: string;
  bytes: Uint8Array;
  declaredType?: unknown;
  size?: number;
  maxBytes?: number;
}): Promise<PhotoResult>;

export function removeProfilePhoto(input: {
  db: unknown;
  storage: PhotoStorage;
  userId: string;
}): Promise<PhotoResult>;
