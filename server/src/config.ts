import dotenv from "dotenv";
dotenv.config();

export type AIProvider = "anthropic" | "ollama" | "fireworks";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  logLevel: process.env.LOG_LEVEL || "info",

  // AI provider: "anthropic", "fireworks", or "ollama"
  aiProvider: (process.env.AI_PROVIDER || "anthropic") as AIProvider,

  // Anthropic
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",

  // Fireworks
  fireworksApiKey: process.env.FIREWORKS_API_KEY || "",

  // Model name (provider-specific)
  aiModel: process.env.AI_MODEL || "claude-sonnet-4-20250514",

  // Ollama
  ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",

  // Auth tokens (must match ERPNext settings)
  authTokenKey: process.env.AUTH_TOKEN_KEY || "",
  authTokenSecret: process.env.AUTH_TOKEN_SECRET || "",

  // File limits
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || "20", 10),
} as const;

export function validateConfig(): void {
  if (config.aiProvider === "anthropic" && !config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic");
  }
  if (config.aiProvider === "fireworks" && !config.fireworksApiKey) {
    throw new Error("FIREWORKS_API_KEY is required when AI_PROVIDER=fireworks");
  }
  if (!config.authTokenKey || !config.authTokenSecret) {
    throw new Error(
      "AUTH_TOKEN_KEY and AUTH_TOKEN_SECRET environment variables are required"
    );
  }
}
