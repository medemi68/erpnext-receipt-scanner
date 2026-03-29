import { config } from "../config.js";
import type { ProcessedImage } from "./fileProcessor.js";
import type { AIExtractionResult } from "../types/index.js";
import {
  INVOICE_EXTRACTION_PROMPT,
  MULTI_PAGE_ADDENDUM,
} from "../prompts/invoice-extraction.js";
import * as anthropicProvider from "../providers/anthropic.js";
import * as ollamaProvider from "../providers/ollama.js";
import * as fireworksProvider from "../providers/fireworks.js";

type Provider = {
  extract: (images: ProcessedImage[], prompt: string) => Promise<string>;
};

const providers: Record<string, Provider> = {
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
  fireworks: fireworksProvider,
};

/**
 * Extract the first valid JSON object from a string that may contain
 * thinking text, tags, markdown fences, or conversational text around it.
 * Finds the outermost balanced { ... } block by tracking brace depth.
 */
function extractJson(raw: string): string {
  let text = raw.trim();

  // Strip thinking blocks - models use various tag names
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
  text = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim();

  // Strip markdown code fences
  text = text.replace(/```(?:json)?\n?([\s\S]*?)\n?```/g, "$1").trim();

  // Find the largest balanced JSON object by tracking brace depth
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  let bestStart = -1;
  let bestEnd = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        // Keep the largest balanced block (the real JSON, not a small {} in thinking)
        if (bestStart === -1 || candidate.length > (bestEnd - bestStart + 1)) {
          bestStart = start;
          bestEnd = i;
        }
        start = -1;
      }
    }
  }

  if (bestStart !== -1) {
    return text.slice(bestStart, bestEnd + 1);
  }

  throw new Error(
    `No JSON found in model response. First 200 chars: ${raw.slice(0, 200)}`
  );
}

export async function extractInvoiceData(
  images: ProcessedImage[]
): Promise<AIExtractionResult> {
  const provider = providers[config.aiProvider];
  if (!provider) {
    throw new Error(
      `Unknown AI provider: "${config.aiProvider}". Valid options: ${Object.keys(providers).join(", ")}`
    );
  }

  const prompt =
    images.length > 1
      ? INVOICE_EXTRACTION_PROMPT + MULTI_PAGE_ADDENDUM
      : INVOICE_EXTRACTION_PROMPT;

  const rawText = await provider.extract(images, prompt);
  const jsonText = extractJson(rawText);
  const parsed: AIExtractionResult = JSON.parse(jsonText);
  return parsed;
}
