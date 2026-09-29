import type { ZodTypeAny, output } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Girdi doğrulanamadı", result.error.flatten());
  }
  return result.data;
}

export function notFound(message = "Kayıt bulunamadı"): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function forbidden(message = "Bu işlem için yetkin yok"): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function unauthorized(message = "Oturum gerekli"): AppError {
  return new AppError(401, "UNAUTHENTICATED", message);
}
