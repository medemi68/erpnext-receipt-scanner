import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { ProcessedImage } from "../services/fileProcessor.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

export async function extract(
  images: ProcessedImage[],
  prompt: string
): Promise<string> {
  const content: Anthropic.ContentBlockParam[] = [];

  for (const image of images) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.base64,
      },
    });
  }

  content.push({ type: "text", text: prompt });

  const response = await getClient().messages.create({
    model: config.aiModel,
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Anthropic");
  }

  return textBlock.text;
}
