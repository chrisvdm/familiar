import type { FamiliarErrorCode } from "./types.js";

export class FamiliarError extends Error {
  code: FamiliarErrorCode;
  status: number;

  constructor({ code, message, status }: { code: FamiliarErrorCode; message: string; status: number }) {
    super(message);
    this.name = "FamiliarError";
    this.code = code;
    this.status = status;
  }
}

export const request = async <T>({
  host,
  method,
  path,
  token,
  body,
}: {
  host: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  token?: string;
  body?: unknown;
}): Promise<T> => {
  const url = `${host.replace(/\/$/, "")}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err: unknown) {
    const detail = (err as { cause?: { message?: string }; message?: string })?.cause?.message ?? (err as Error)?.message ?? "Network error";
    throw new FamiliarError({ code: "internal_error", message: detail, status: 0 });
  }

  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    const error = payload?.error as { code?: string; message?: string } | undefined;
    throw new FamiliarError({
      code: (error?.code ?? "internal_error") as FamiliarErrorCode,
      message: error?.message ?? `Request failed: ${response.status}`,
      status: response.status,
    });
  }

  return payload as T;
};
