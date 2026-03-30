export const INVOICE_EXTRACTION_PROMPT = `You are an invoice data extraction system. Analyze the provided invoice/receipt image(s) and extract all data into structured JSON.

Return ONLY valid JSON with no additional text, using this exact structure:

{
  "InvoiceId": "<invoice/receipt number, excluding any # signs>",
  "InvoiceDate": "<YYYY-MM-DD>",
  "VendorName": "<supplier/vendor company name, normalized>",
  "VendorAddress": {
    "streetAddress": "<street address, normalized>",
    "city": "<city, normalized, capitalize>",
    "postalCode": "<postal/zip code>",
    "countryRegion": "<country full name, normalized>"
  },
  "VendorTaxId": "<tax ID / VAT number>",
  "InvoiceTotal": <grand total including tax as number>,
  "CurrencyCode": "<ISO 4217 currency code e.g. EUR, USD, GBP>",
  "SubTotal": <subtotal before tax as number>,
  "TotalTax": <total tax/VAT amount as number>,
  "TotalDiscount": <total discount as number, 0 if none>,
  "PaymentTerm": "<payment terms if visible, empty string if not>",
  "Items": [
    {
      "Description": "<item/service description, normalized>",
      "ProductCode": "<product code/SKU if available, empty string if not>",
      "Quantity": <quantity as number>,
      "UnitPrice": <unit price as number>,
      "Amount": <line total as number>,
      "ExpenseAccount": "<expense account name from the list below, or empty string>"
    }
  ],
  "Confidence": {
    "InvoiceId": <0.0-1.0>,
    "InvoiceDate": <0.0-1.0>,
    "VendorName": <0.0-1.0>,
    "VendorAddress": <0.0-1.0>,
    "VendorTaxId": <0.0-1.0>,
    "InvoiceTotal": <0.0-1.0>,
    "SubTotal": <0.0-1.0>,
    "TotalTax": <0.0-1.0>,
    "TotalDiscount": <0.0-1.0>
  }
}

Rules:
- All monetary amounts must be numbers (not strings), using decimal point notation (e.g., 1234.56)
- Dates must be in YYYY-MM-DD format
- If a field is not found on the invoice, use empty string for strings, 0 for numbers
- Confidence is your certainty from 0.0 (guess) to 1.0 (clearly visible and unambiguous)
- Include ALL line items found on the invoice, including discounts as negative line items
- IMPORTANT: If discounts are already included as negative line items in the Items array, set TotalDiscount to 0. Only use TotalDiscount for discounts that are NOT represented as line items. Never double-count discounts.
- SubTotal should be the sum of all line item amounts (including negative discount items), before tax
- The CurrencyCode should be the ISO 4217 code (EUR, USD, GBP, etc.)
- If the document spans multiple pages, extract and combine data from all pages
- Normalize all text so that each word's first letter is capitalized where necessary, but not completely uppercase`;

export function buildExpenseAccountsAddendum(accounts: string[]): string {
  if (!accounts.length) return "";
  return `

EXPENSE ACCOUNT CATEGORIZATION:
For each line item, set the "ExpenseAccount" field to the most appropriate account from the following list. Use your best judgment based on the item description. You MUST use the EXACT account name from this list (copy it exactly). If no account is a good fit, use an empty string.

Available expense accounts:
${accounts.map((a) => `- ${a}`).join("\n")}`;
}

export const MULTI_PAGE_ADDENDUM =
  "\n\nThis document spans multiple pages. Extract data from ALL pages and combine into a single result.";
