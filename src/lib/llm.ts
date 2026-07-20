import Anthropic from "@anthropic-ai/sdk";

// Provider-agnostic LLM completion. One switch — LLM_PROVIDER=anthropic|openai —
// flips every AI feature (insights, forecast loop, import parsing, backtests).
// If LLM_PROVIDER is unset, we use whichever API key is configured
// (Anthropic wins when both are).

export type LlmPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; base64: string }
  | { type: "pdf"; filename: string; base64: string };

export type LlmProvider = "anthropic" | "openai";

const ANTHROPIC_MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const OPENAI_MODEL = () => process.env.OPENAI_MODEL || "gpt-5.1";

export function llmProvider(): LlmProvider {
  const explicit = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (explicit === "openai" || explicit === "anthropic") return explicit;
  if (!process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY) return "openai";
  return "anthropic";
}

/** Is there an API key for the active provider? (Else callers fall back.) */
export function hasLlmKey(): boolean {
  return llmProvider() === "openai"
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);
}

export function llmModelName(): string {
  return llmProvider() === "openai" ? OPENAI_MODEL() : ANTHROPIC_MODEL();
}

export async function llmComplete(opts: {
  system: string;
  parts: LlmPart[];
  maxTokens?: number;
}): Promise<{ text: string; model: string }> {
  return llmProvider() === "openai" ? openaiComplete(opts) : anthropicComplete(opts);
}

// --- Anthropic ---------------------------------------------------------------
async function anthropicComplete({ system, parts, maxTokens = 1400 }: Parameters<typeof llmComplete>[0]) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content: Anthropic.ContentBlockParam[] = parts.map((p) => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.type === "image")
      return {
        type: "image",
        source: { type: "base64", media_type: p.mediaType as "image/png", data: p.base64 },
      };
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: p.base64 },
    };
  });
  const res = await client.messages.create({
    model: ANTHROPIC_MODEL(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { text, model: res.model ?? ANTHROPIC_MODEL() };
}

// --- OpenAI ------------------------------------------------------------------
async function openaiComplete({ system, parts, maxTokens = 1400 }: Parameters<typeof llmComplete>[0]) {
  const model = OPENAI_MODEL();
  const content = parts.map((p) => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.type === "image")
      return { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.base64}` } };
    return {
      type: "file",
      file: { filename: p.filename, file_data: `data:application/pdf;base64,${p.base64}` },
    };
  });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      // GPT-5-era models take max_completion_tokens (max_tokens is rejected).
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
  };
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  return { text, model: data.model ?? model };
}
