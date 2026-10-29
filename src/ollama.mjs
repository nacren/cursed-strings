// Minimal Ollama HTTP client. No dependencies, it uses Node's global fetch.
// Talks to a local Ollama daemon, default http://localhost:11434.

const HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

/** List locally available model names. */
export async function listModels() {
  try {
    const res = await fetch(`${HOST}/api/tags`);
    if (!res.ok) return [];
    const j = await res.json();
    return (j.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

export class ToolsUnsupportedError extends Error {}

/**
 * Send a chat completion. Returns { content, thinking, toolCalls, raw }.
 * raw is Ollama's whole reply, which includes prompt_eval_count (prompt tokens).
 * Throws ToolsUnsupportedError if the model rejects the tools parameter.
 */
export async function chat(
  model,
  messages,
  { temperature = 0.7, seed, tools, think, numCtx, numPredict, timeoutMs = 600000 } = {},
) {
  const body = {
    model,
    messages,
    stream: false,
    options: { temperature },
  };
  if (seed !== undefined) body.options.seed = seed;
  // Our prompts are tiny; a small context avoids an oversized KV cache that
  // would spill a big model onto the CPU and crawl.
  if (numCtx !== undefined) body.options.num_ctx = numCtx;
  if (numPredict !== undefined) body.options.num_predict = numPredict;
  if (tools) body.tools = tools;
  // For thinking models such as Qwen3, think=false keeps latency sane. Left
  // undefined, the model uses its default.
  if (think !== undefined) body.think = think;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${HOST}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text();
    if (/tool|function/i.test(text) && /support|not/i.test(text)) {
      throw new ToolsUnsupportedError(text);
    }
    throw new Error(`ollama ${res.status}: ${text}`);
  }
  const j = await res.json();
  return {
    content: j.message?.content ?? "",
    thinking: j.message?.thinking ?? "",
    toolCalls: j.message?.tool_calls ?? [],
    raw: j,
  };
}
