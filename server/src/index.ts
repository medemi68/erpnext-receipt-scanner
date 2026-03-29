import express from "express";
import { config, validateConfig } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";
import uploadRouter from "./routes/upload.js";
import creditsRouter from "./routes/credits.js";
import healthRouter from "./routes/health.js";

validateConfig();

const app = express();

app.use(express.json());

// Health check (no auth required)
app.use(healthRouter);

// Protected routes
app.use(authMiddleware, uploadRouter);
app.use(authMiddleware, creditsRouter);

app.listen(config.port, () => {
  console.log(`Invoice OCR server running on port ${config.port}`);
  console.log(`AI provider: ${config.aiProvider}`);
  console.log(`AI model: ${config.aiModel}`);
  if (config.aiProvider === "ollama") {
    console.log(`Ollama URL: ${config.ollamaUrl}`);
  }
  console.log(`Max file size: ${config.maxFileSizeMb} MB`);
});

export default app;
