import { NextResponse } from "next/server";

export function ok(data: unknown = { ok: true }) {
  return NextResponse.json(data);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function handle<T>(fn: () => T | Promise<T>) {
  try {
    const r = await fn();
    return NextResponse.json(r ?? { ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
