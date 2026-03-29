import OpenAI from "openai";
import { config } from "../config.js";
import type { ProcessedImage } from "../services/fileProcessor.js";

const client = new OpenAI({
  apiKey: config.fireworksApiKey,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

export async function extract(
  images: ProcessedImage[],
  prompt: string
): Promise<string> {
  const content: OpenAI.ChatCompletionContentPart[] = [];

  for (const image of images) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mediaType};base64,${image.base64}`,
      },
    });
  }

  const isThinkingModel = config.aiModel.includes("thinking");
  const userPrompt = isThinkingModel ? `/no_think\n${prompt}` : prompt;
  content.push({ type: "text", text: userPrompt });

  // Stream to bypass max_tokens > 4096 restriction
  const stream = await client.chat.completions.create({
    model: config.aiModel,
    messages: [
      {
        role: "system",
        content:
          "You are a JSON extraction API. Respond with ONLY a raw JSON object. No thinking. No explanations. No markdown.",
      },
      { role: "user", content },
    ],
    max_tokens: 16384,
    stream: true,
  });

  let fullText = "";
  process.stdout.write("\n--- Fireworks streaming ---\n");

  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content || "";
    if (token) {
      fullText += token;
      process.stdout.write(token);
    }
  }

  process.stdout.write(`\n--- end (total ${fullText.length} chars) ---\n\n`);

  if (!fullText) {
    throw new Error("Empty response from Fireworks");
  }

  return fullText;
}
