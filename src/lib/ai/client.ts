import { getSetting, setSetting } from "../db";

export type AIConfig = { baseUrl: string; apiKey: string; model: string };

export function getAIConfig(): AIConfig | null {
  const baseUrl = getSetting("ai.baseUrl");
  const apiKey = getSetting("ai.apiKey");
  const model = getSetting("ai.model");
  if (!baseUrl || !model) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey: apiKey ?? "", model };
}

export function hasAI(): boolean {
  return getAIConfig() !== null;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export class AIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function friendlyError(status: number, bodyText: string): string {
  let detail = bodyText.slice(0, 300);
  try {
    const j = JSON.parse(bodyText);
    detail = j?.error?.message ?? j?.message ?? detail;
  } catch {
    /* keep raw */
  }
  if (status === 401 || status === 403)
    return `The API rejected the key (HTTP ${status}). Check that your API key is correct and has access to this model. ${detail}`;
  if (status === 404)
    return `Endpoint or model not found (HTTP 404). Check the Base URL (usually ends in /v1) and the model name. ${detail}`;
  if (status === 429)
    return `Rate limit or quota exceeded (HTTP 429). ${detail}`;
  if (status >= 500)
    return `The AI provider had a server error (HTTP ${status}). Try again. ${detail}`;
  return `AI request failed (HTTP ${status}). ${detail}`;
}

export async function chatComplete(
  messages: ChatMessage[],
  opts: {
    temperature?: number;
    maxTokens?: number;
    json?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<string> {
  const cfg = getAIConfig();
  if (!cfg)
    throw new AIError(
      "AI is not configured. Add your API key, base URL and model in Settings → AI Provider.",
      400
    );

  const url = `${cfg.baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 3000,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 180_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: unknown) {
    clearTimeout(timer);
    const err = e as Error;
    if (err.name === "AbortError")
      throw new AIError("The AI request timed out. Try again or use a faster model.");
    throw new AIError(
      `Could not reach the AI endpoint at ${url}. Check the Base URL and your connection. (${err.message})`
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  if (!res.ok) throw new AIError(friendlyError(res.status, text), res.status);

  let content = "";
  try {
    const json = JSON.parse(text);
    content = json?.choices?.[0]?.message?.content ?? "";
    if (typeof content !== "string") content = String(content ?? "");
  } catch {
    throw new AIError(
      "The AI endpoint returned an unexpected response format (not OpenAI-compatible chat completions)."
    );
  }
  if (!content.trim())
    throw new AIError("The AI returned an empty response. Try again or adjust the model.");
  return content;
}

// Some OpenAI-compatible providers reject response_format; retry without it.
export async function chatCompleteResilient(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  try {
    return await chatComplete(messages, { ...opts, json: true });
  } catch (e) {
    if (e instanceof AIError && e.status === 400) {
      return await chatComplete(messages, { ...opts, json: false });
    }
    throw e;
  }
}

function extractJSON(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // Slice from first { or [ to last matching brace
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start =
    firstArr !== -1 && (firstObj === -1 || firstArr < firstObj) ? firstArr : firstObj;
  if (start > 0) s = s.slice(start);
  return s.trim();
}

export async function chatJSON<T>(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {}
): Promise<T> {
  const first = await chatCompleteResilient(messages, opts);
  try {
    return JSON.parse(extractJSON(first)) as T;
  } catch {
    // One retry asking for pure JSON
    const second = await chatCompleteResilient(
      [
        ...messages,
        { role: "assistant", content: first.slice(0, 2000) },
        {
          role: "user",
          content:
            "Your previous reply was not valid JSON. Reply again with ONLY valid JSON, no prose, no markdown fences.",
        },
      ],
      opts
    );
    try {
      return JSON.parse(extractJSON(second)) as T;
    } catch {
      throw new AIError(
        "The AI did not return valid JSON. Try a stronger model (e.g. gpt-4o, claude-sonnet, gemini-pro) in Settings."
      );
    }
  }
}

export async function testConnection(
  cfg: AIConfig
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 10,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const bodyText = await res.text();
    if (!res.ok) return { ok: false, message: friendlyError(res.status, bodyText) };
    const json = JSON.parse(bodyText);
    const reply = json?.choices?.[0]?.message?.content ?? "";
    return {
      ok: true,
      message: `Connected — model replied "${String(reply).trim().slice(0, 40)}"`,
      latencyMs: Date.now() - started,
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      message: `Could not reach ${url} — ${err.message}. Check the Base URL (should be an OpenAI-compatible endpoint, e.g. https://api.openai.com/v1).`,
    };
  }
}

export async function visionSupported(): Promise<boolean> {
  return getSetting("ai.vision") !== "0";
}

// Mark that a model failed a vision call so we stop trying (still retryable in Settings).
export function markVisionFailed() {
  setSetting("ai.vision", "0");
}
export function resetVisionFlag() {
  setSetting("ai.vision", "1");
}
