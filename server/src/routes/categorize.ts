import { Router, Request, Response } from "express";
import { config } from "../config.js";
import type { ProcessedImage } from "../services/fileProcessor.js";
import * as anthropicProvider from "../providers/anthropic.js";
import * as ollamaProvider from "../providers/ollama.js";
import * as fireworksProvider from "../providers/fireworks.js";

const router = Router();

type Provider = {
  extract: (images: ProcessedImage[], prompt: string) => Promise<string>;
};

const providers: Record<string, Provider> = {
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
  fireworks: fireworksProvider,
};

interface LineItem {
  idx: number;
  item_code: string;
  description: string;
  current_account: string;
  amount: number;
}

interface InvoiceForCategorization {
  name: string;
  supplier: string;
  items: LineItem[];
}

interface CategorizedItem {
  invoice: string;
  supplier: string;
  idx: number;
  item_code: string;
  description: string;
  current_account: string;
  suggested_account: string;
  amount: number;
}

function extractJson(raw: string): string {
  let text = raw.trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
  text = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "").trim();
  text = text.replace(/```(?:json)?\n?([\s\S]*?)\n?```/g, "$1").trim();

  // Find largest balanced JSON (could be array or object)
  const startChar = text.indexOf("[") < text.indexOf("{") && text.indexOf("[") !== -1 ? "[" : "{";
  const endChar = startChar === "[" ? "]" : "}";

  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  let bestStart = -1;
  let bestEnd = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === startChar) {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === endChar) {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
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

  throw new Error(`No JSON found in response. First 200 chars: ${raw.slice(0, 200)}`);
}

router.post("/api/method/categorize_expenses", async (req: Request, res: Response): Promise<void> => {
  try {
    const { invoices, expense_accounts } = req.body as {
      invoices: InvoiceForCategorization[];
      expense_accounts: string[];
    };

    if (!invoices || !expense_accounts) {
      res.status(400).json({ success: false, message: "Missing invoices or expense_accounts" });
      return;
    }

    const provider = providers[config.aiProvider];
    if (!provider) {
      res.status(500).json({ success: false, message: `Unknown AI provider: ${config.aiProvider}` });
      return;
    }

    // Build a text-only prompt (no images needed)
    const itemsList = invoices.flatMap((inv) =>
      inv.items.map((item) => ({
        key: `${inv.name}|${item.idx}`,
        supplier: inv.supplier,
        description: item.description,
        amount: item.amount,
        current_account: item.current_account,
      }))
    );

    const prompt = `You are an accounting categorization system. Given a list of purchase invoice line items with their supplier names and descriptions, categorize each into the most appropriate expense account.

Available expense accounts:
${expense_accounts.map((a) => `- ${a}`).join("\n")}

Line items to categorize:
${itemsList.map((item, i) => `${i + 1}. Supplier: "${item.supplier}" | Description: "${item.description}" | Amount: ${item.amount} | Current account: "${item.current_account}"`).join("\n")}

Return ONLY a JSON array with one entry per line item, in the same order:
[
  {
    "key": "<invoice_name|idx>",
    "suggested_account": "<exact account name from the list above>"
  }
]

Rules:
- You MUST use the EXACT account name from the available list (copy it exactly)
- Consider the supplier name for context (e.g., a telecom company's charges are likely telephone expenses)
- If no account is a good fit, use the current account as the suggestion
- Return the array in the same order as the input`;

    // Send as text-only (empty images array)
    const rawText = await provider.extract([], prompt);
    const jsonText = extractJson(rawText);
    const suggestions: Array<{ key: string; suggested_account: string }> = JSON.parse(jsonText);

    // Map suggestions back to the full item data
    const results: CategorizedItem[] = [];
    let suggestionIdx = 0;

    for (const inv of invoices) {
      for (const item of inv.items) {
        const key = `${inv.name}|${item.idx}`;
        const suggestion = suggestions.find((s) => s.key === key) || suggestions[suggestionIdx];
        suggestionIdx++;

        results.push({
          invoice: inv.name,
          supplier: inv.supplier,
          idx: item.idx,
          item_code: item.item_code,
          description: item.description,
          current_account: item.current_account,
          suggested_account: suggestion?.suggested_account || item.current_account,
          amount: item.amount,
        });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Categorization error: ${message}`);
    res.status(500).json({ success: false, message: `Categorization error: ${message}` });
  }
});

export default router;
