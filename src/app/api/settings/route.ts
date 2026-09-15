import { db, getSetting, setSetting, getProfile } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { getAIConfig, testConnection, resetVisionFlag, type AIConfig } from "@/lib/ai/client";
import { applyPreferences } from "../profile/route";

function maskKey(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

export async function GET() {
  return handle(() => {
    const cfg = getAIConfig();
    const profile = getProfile();
    return {
      ai: cfg
        ? { baseUrl: cfg.baseUrl, model: cfg.model, apiKeyMasked: maskKey(cfg.apiKey ?? undefined), hasKey: !!cfg.apiKey }
        : { baseUrl: "", model: "", apiKeyMasked: null, hasKey: false },
      demo: getSetting("demo.active") === "1",
      profile: profile ?? null,
    };
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const ai = (b.ai ?? {}) as Record<string, unknown>;
    if (typeof ai.baseUrl === "string") setSetting("ai.baseUrl", ai.baseUrl.trim().replace(/\/+$/, ""));
    if (typeof ai.model === "string") setSetting("ai.model", ai.model.trim());
    if (typeof ai.apiKey === "string" && ai.apiKey.trim() !== "") setSetting("ai.apiKey", ai.apiKey.trim());
    if (ai.clearKey === true) setSetting("ai.apiKey", "");
    if (b.preferences) applyPreferences(b.preferences as Record<string, unknown>);
    if (b.profile && typeof b.profile === "object") {
      const p = b.profile as Record<string, unknown>;
      const sets: Array<[string, string]> = [];
      if (typeof p.name === "string") sets.push(["name", p.name.slice(0, 80)]);
      if (typeof p.grade_level === "string") sets.push(["grade_level", p.grade_level.slice(0, 40)]);
      if (typeof p.school_year === "string") sets.push(["school_year", p.school_year.slice(0, 20)]);
      if (sets.length) {
        const frag = sets.map(([k]) => `${k} = ?`).join(", ");
        db.prepare(`UPDATE student_profile SET ${frag}, updated_at = datetime('now') WHERE id = 1`).run(...sets.map(([, v]) => v));
      }
    }
    return { ok: true };
  });
}

// POST { action: "test" } with optional config override → test connection
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    if (b.action === "test") {
      const cfg = getAIConfig();
      const override: AIConfig = {
        baseUrl: String(b.baseUrl ?? cfg?.baseUrl ?? "").trim().replace(/\/+$/, ""),
        apiKey: String(b.apiKey ?? "").trim() || cfg?.apiKey || "",
        model: String(b.model ?? cfg?.model ?? "").trim(),
      };
      if (!override.baseUrl || !override.model)
        return { ok: false, message: "Base URL and model are required (e.g. https://api.openai.com/v1 + gpt-4o-mini)." };
      const res = await testConnection(override);
      if (res.ok) resetVisionFlag();
      return res;
    }
    throw new Error("Unknown action");
  });
}
