import { errorResponse } from "./response";

export function requireUser(context: any): string | Response {
  if (!context.data?.userId) {
    return errorResponse("Unauthorized: Missing or invalid token", 401);
  }
  return context.data.userId as string;
}

export async function readJson(request: Request): Promise<any | Response> {
  try {
    return await request.json();
  } catch {
    return errorResponse("Invalid JSON payload", 400);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
