export function payloadTooLargeError(): Error & { statusCode?: number };

export function unsupportedMediaTypeError(): Error & { statusCode?: number };

export function isJsonContentType(value: string | null): boolean;

export function assertJsonContentType(req: Request): void;

export function readBodyWithLimit(
  req: Request,
  maxBytes: number
): Promise<Buffer>;

export function readMultipartBody(
  req: Request,
  maxBytes: number
): Promise<FormData>;
