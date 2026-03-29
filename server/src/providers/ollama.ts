import { config } from "../config.js";
import type { ProcessedImage } from "../services/fileProcessor.js";

/**
 * Ollama provider using the native /api/chat endpoint.
 * Uses raw base64 images (no data URL wrapper) which is more reliable
 * for vision models like qwen2.5-vl, qwen3-vl, gemma3, etc.
 */

interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    images?: string[]; // raw base64 strings
  }>;
  stream: boolean;
}

interface OllamaStreamChunk {
  message?: { content: string };
  done: boolean;
}

export async function extract(
  images: ProcessedImage[],
  prompt: string
): Promise<string> {
  const url = `${config.ollamaUrl.replace(/\/$/, "")}/api/chat`;

  // Ollama native API takes raw base64 strings (no data:... prefix)
  const base64Images = images.map((img) => img.base64);

  const body: OllamaChatRequest = {
    model: config.aiModel,
    messages: [
      {
        role: "user",
        content: prompt,
        images: base64Images,
      },
    ],
    stream: true,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error ${response.status}: ${text}`);
  }

  if (!response.body) {
    throw new Error("No response body from Ollama");
  }

  // Stream tokens and print them live
  let fullText = "";
  let insideThink = false;

  process.stdout.write("\n--- Ollama streaming ---\n");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Ollama native API sends one JSON object per line (NDJSON)
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const chunk: OllamaStreamChunk = JSON.parse(trimmed);
        const token = chunk.message?.content || "";
        if (!token) continue;

        fullText += token;

        // Track <think> blocks - dim them in output
        if (token.includes("<think>")) insideThink = true;
        if (insideThink) {
          process.stdout.write(`\x1b[2m${token}\x1b[0m`); // dim
        } else {
          process.stdout.write(token);
        }
        if (token.includes("</think>")) insideThink = false;
      } catch {
        // Skip malformed lines
      }
    }
  }

  process.stdout.write("\n--- end stream ---\n\n");

  // Strip <think>...</think> blocks from the final output
  const cleaned = fullText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  return cleaned;
}
