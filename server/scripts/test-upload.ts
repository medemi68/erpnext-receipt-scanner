#!/usr/bin/env npx tsx

/**
 * Test script for the Invoice OCR server.
 *
 * Usage:
 *   npx tsx scripts/test-upload.ts <path-to-invoice>
 *   npx tsx scripts/test-upload.ts ./tests/fixtures/sample_invoice.pdf
 *   npx tsx scripts/test-upload.ts ~/receipts/receipt.jpg --raw
 *
 * Options:
 *   --raw       Print the full raw JSON response (as ERPNext would receive it)
 *   --server    Server URL (default: http://localhost:3000)
 *   --key       Auth token key (default: from .env AUTH_TOKEN_KEY)
 *   --secret    Auth token secret (default: from .env AUTH_TOKEN_SECRET)
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ── Args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

function flagValue(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const filePath = positional[0];
const showRaw = flags.has("--raw");
const serverUrl = flagValue("server") || "http://localhost:3000";
const authKey = flagValue("key") || process.env.AUTH_TOKEN_KEY || "";
const authSecret = flagValue("secret") || process.env.AUTH_TOKEN_SECRET || "";

if (!filePath) {
  console.error("Usage: npx tsx scripts/test-upload.ts <path-to-invoice> [--raw] [--server URL]");
  console.error("");
  console.error("Examples:");
  console.error("  npx tsx scripts/test-upload.ts invoice.pdf");
  console.error("  npx tsx scripts/test-upload.ts receipt.jpg --raw");
  console.error("  npx tsx scripts/test-upload.ts invoice.pdf --server http://invoice-ocr:3000");
  process.exit(1);
}

const resolvedPath = path.resolve(filePath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`File not found: ${resolvedPath}`);
  process.exit(1);
}

if (!authKey || !authSecret) {
  console.error("Auth credentials required. Set AUTH_TOKEN_KEY and AUTH_TOKEN_SECRET in .env or pass --key / --secret");
  process.exit(1);
}

// ── Upload ────────────────────────────────────────────────────────────

const endpoint = `${serverUrl}/api/method/doc2sys.doc2sys.doctype.doc2sys_item.doc2sys_item.upload_and_create_item`;

const fileName = path.basename(resolvedPath);
const fileBuffer = fs.readFileSync(resolvedPath);
const fileBlob = new Blob([fileBuffer]);

const formData = new FormData();
formData.append("file", fileBlob, fileName);
formData.append("is_private", "1");

console.log(`Uploading: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
console.log(`Server:    ${serverUrl}`);
console.log(`Auth:      ${authKey.slice(0, 4)}...:${authSecret.slice(0, 4)}...`);
console.log("─".repeat(60));
console.log("");

async function main() {
const startTime = Date.now();

try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `token ${authKey}:${authSecret}`,
    },
    body: formData,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!response.ok) {
    const text = await response.text();
    console.error(`HTTP ${response.status}: ${text}`);
    process.exit(1);
  }

  const data = await response.json();

  if (showRaw) {
    console.log("RAW RESPONSE (as ERPNext receives it):");
    console.log("─".repeat(60));
    console.log(JSON.stringify(data, null, 2));
    console.log("");
    console.log(`Completed in ${elapsed}s`);
    process.exit(0);
  }

  // ── Pretty print ──────────────────────────────────────────────────

  if (!data.message?.success) {
    console.error("Extraction failed:", data.message?.message || "Unknown error");
    process.exit(1);
  }

  const extractedDoc = JSON.parse(data.message.extracted_doc);

  const conf = (val: number) => {
    if (val >= 0.9) return `\x1b[32m${(val * 100).toFixed(0)}%\x1b[0m`; // green
    if (val >= 0.7) return `\x1b[33m${(val * 100).toFixed(0)}%\x1b[0m`; // yellow
    return `\x1b[31m${(val * 100).toFixed(0)}%\x1b[0m`;                  // red
  };

  const currency = extractedDoc.InvoiceTotal?.valueCurrency?.currencyCode || "???";
  const fmt = (amount: number) => `${currency} ${amount.toFixed(2)}`;

  console.log("EXTRACTION RESULTS");
  console.log("═".repeat(60));
  console.log("");

  // Header
  console.log(`  Invoice #:    ${extractedDoc.InvoiceId?.valueString || "N/A"}  (${conf(extractedDoc.InvoiceId?.confidence || 0)})`);
  console.log(`  Date:         ${extractedDoc.InvoiceDate?.valueDate || "N/A"}  (${conf(extractedDoc.InvoiceDate?.confidence || 0)})`);
  console.log(`  Vendor:       ${extractedDoc.VendorName?.valueString || "N/A"}  (${conf(extractedDoc.VendorName?.confidence || 0)})`);

  const addr = extractedDoc.VendorAddress?.valueAddress;
  if (addr) {
    const parts = [addr.streetAddress, addr.city, addr.postalCode, addr.countryRegion].filter(Boolean);
    console.log(`  Address:      ${parts.join(", ") || "N/A"}  (${conf(extractedDoc.VendorAddress?.confidence || 0)})`);
  }

  console.log(`  Tax ID:       ${extractedDoc.VendorTaxId?.valueString || "N/A"}  (${conf(extractedDoc.VendorTaxId?.confidence || 0)})`);
  console.log(`  Payment Term: ${extractedDoc.PaymentTerm?.valueString || "N/A"}`);
  console.log("");

  // Items
  const items = extractedDoc.Items?.valueArray || [];
  if (items.length > 0) {
    console.log("  LINE ITEMS");
    console.log("  " + "─".repeat(58));
    console.log(`  ${"#".padEnd(4)}${"Description".padEnd(30)}${"Qty".padStart(6)}${"Unit".padStart(10)}${"Amount".padStart(10)}`);
    console.log("  " + "─".repeat(58));

    for (let i = 0; i < items.length; i++) {
      const item = items[i].valueObject;
      const desc = (item.Description?.valueString || "").slice(0, 28);
      const qty = item.Quantity?.valueNumber ?? 0;
      const unit = item.UnitPrice?.valueCurrency?.amount ?? 0;
      const amount = item.Amount?.valueCurrency?.amount ?? 0;

      console.log(
        `  ${String(i + 1).padEnd(4)}${desc.padEnd(30)}${qty.toString().padStart(6)}${unit.toFixed(2).padStart(10)}${amount.toFixed(2).padStart(10)}`
      );
    }
    const lineItemsTotal = items.reduce(
      (sum: number, it: any) => sum + (it.valueObject?.Amount?.valueCurrency?.amount ?? 0), 0
    );
    console.log("  " + "─".repeat(58));
    console.log(`  ${"".padEnd(4)}${"Line items total".padEnd(30)}${"".padStart(6)}${"".padStart(10)}${lineItemsTotal.toFixed(2).padStart(10)}`);
  } else {
    console.log("  (no line items extracted)");
  }

  console.log("");

  // Totals
  const subtotal = extractedDoc.SubTotal?.valueCurrency?.amount ?? 0;
  const tax = extractedDoc.TotalTax?.valueCurrency?.amount ?? 0;
  const discount = extractedDoc.TotalDiscount?.valueCurrency?.amount ?? 0;
  const total = extractedDoc.InvoiceTotal?.valueCurrency?.amount ?? 0;

  console.log(`  Subtotal:     ${fmt(subtotal).padStart(16)}  (${conf(extractedDoc.SubTotal?.confidence || 0)})`);
  if (discount > 0) {
    console.log(`  Discount:    -${fmt(discount).padStart(16)}  (${conf(extractedDoc.TotalDiscount?.confidence || 0)})`);
  }
  console.log(`  Tax:          ${fmt(tax).padStart(16)}  (${conf(extractedDoc.TotalTax?.confidence || 0)})`);
  console.log("  " + "─".repeat(40));
  console.log(`  Total:        ${fmt(total).padStart(16)}  (${conf(extractedDoc.InvoiceTotal?.confidence || 0)})`);

  // Validation - check both cases:
  // Case 1: subtotal is BEFORE discount -> total = subtotal - discount + tax
  // Case 2: subtotal is AFTER discount  -> total = subtotal + tax
  console.log("");
  const withDiscount = subtotal + tax - discount;
  const withoutDiscount = subtotal + tax;
  const diffWith = Math.abs(withDiscount - total);
  const diffWithout = Math.abs(withoutDiscount - total);

  if (diffWithout <= 0.05) {
    if (discount > 0) {
      console.log(`  \x1b[32mAmounts check out (subtotal already net of discount; subtotal + tax = total)\x1b[0m`);
    } else {
      console.log(`  \x1b[32mAmounts check out (subtotal + tax = total)\x1b[0m`);
    }
  } else if (diffWith <= 0.05) {
    console.log(`  \x1b[32mAmounts check out (subtotal - discount + tax = total)\x1b[0m`);
  } else {
    console.log(`  \x1b[33mWARNING: Amounts don't reconcile.\x1b[0m`);
    console.log(`  \x1b[33m  subtotal + tax - discount = ${fmt(withDiscount)}\x1b[0m`);
    console.log(`  \x1b[33m  subtotal + tax            = ${fmt(withoutDiscount)}\x1b[0m`);
    console.log(`  \x1b[33m  total                     = ${fmt(total)}\x1b[0m`);
  }

  // Line items vs subtotal check
  if (items.length > 0) {
    const lineItemsTotal = items.reduce(
      (sum: number, it: any) => sum + (it.valueObject?.Amount?.valueCurrency?.amount ?? 0), 0
    );
    const linesDiff = Math.abs(lineItemsTotal - subtotal);
    if (linesDiff <= 0.05) {
      console.log(`  \x1b[32mLine items sum matches subtotal (${fmt(lineItemsTotal)})\x1b[0m`);
    } else {
      console.log(`  \x1b[33mWARNING: Line items sum ${fmt(lineItemsTotal)} != subtotal ${fmt(subtotal)} (diff: ${linesDiff.toFixed(2)})\x1b[0m`);
    }
  }

  console.log("");
  console.log(`Completed in ${elapsed}s`);

} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ECONNREFUSED")) {
    console.error(`Cannot connect to server at ${serverUrl}. Is it running?`);
    console.error("Start the server with: npm run dev");
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}
}

main();
