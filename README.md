# ERPNext Receipt Scanner - Self-Hosted Receipt Scanner

> **WARNING: ALPHA SOFTWARE - ACTIVE TESTING BRANCH**
>
> This plugin is in early alpha and under active development. The code might not work at all. Features may be incomplete, broken, or change without notice. **Use at your own risk.** Always back up your ERPNext instance before installing.

A self-hosted invoice/receipt scanner for ERPNext v16 that uses AI vision to extract data from PDFs and images and automatically create Purchase Invoices.

Based on the MIT-licensed [invoice2erpnext](https://github.com/kainotomo/invoice2erpnext) by KAINOTOMO PH LTD, modified to use a self-hosted OCR server instead of the KAINOTOMO paid API.

## Architecture

This repo contains two components:

```
invoice2erpnext/     # Frappe app (installed into ERPNext)
server/              # Node.js/TypeScript OCR server (runs alongside ERPNext)
```

**Flow:** Upload receipt in ERPNext -> Frappe app sends file to OCR server -> OCR server sends image to AI provider -> Structured data returned -> Purchase Invoice created.

## AI Providers

The OCR server supports multiple AI providers, configured via environment variables:

| Provider | `AI_PROVIDER` | Example `AI_MODEL` |
|----------|---------------|---------------------|
| Anthropic | `anthropic` | `claude-sonnet-4-20250514` |
| Fireworks AI | `fireworks` | `accounts/fireworks/models/llama4-scout-instruct-basic` |
| Ollama (local) | `ollama` | `qwen2.5-vl` |

## Prerequisites

- ERPNext v16 running in Docker
- Node.js 20+ and GraphicsMagick (for the OCR server)
- An API key for your chosen AI provider

## Setup

### 1. Build a Custom ERPNext Image

The Frappe app needs to be baked into your ERPNext Docker image.

Create an `apps.json` file:

```json
[
  {
    "url": "https://github.com/frappe/erpnext",
    "branch": "version-16"
  },
  {
    "url": "https://github.com/medemi68/erpnext-receipt-scanner",
    "branch": "main"
  }
]
```

Build the image using [frappe_docker](https://github.com/frappe/frappe_docker):

```bash
git clone https://github.com/frappe/frappe_docker.git
cd frappe_docker

docker build \
  --build-arg=FRAPPE_PATH=https://github.com/frappe/frappe \
  --build-arg=FRAPPE_BRANCH=version-16 \
  --build-arg=APPS_JSON_BASE64=$(base64 -w 0 /path/to/apps.json) \
  --tag=custom-erpnext:latest \
  --file=images/layered/Containerfile .
```

Update your ERPNext `.env`:

```env
CUSTOM_IMAGE=custom-erpnext
CUSTOM_TAG=latest
PULL_POLICY=never
```

### 2. Install the App

```bash
docker compose exec backend bench --site your-site.localhost install-app invoice2erpnext
docker compose exec backend bench --site your-site.localhost migrate
```

### 3. Start the OCR Server

Copy the server into the same directory as your compose.yaml:

```
cp ./server /<your installation of erpnext/invoice-ocr-server
```

Add to your ERPNext `compose.yaml`:

```yaml
  invoice-ocr:
    build: ./invoice-ocr-server
    restart: unless-stopped
    environment:
      - AI_PROVIDER=${AI_PROVIDER:-fireworks}
      - FIREWORKS_API_KEY=${FIREWORKS_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - AI_MODEL=${AI_MODEL}
      - AUTH_TOKEN_KEY=${AUTH_TOKEN_KEY}
      - AUTH_TOKEN_SECRET=${AUTH_TOKEN_SECRET}
```

Or run it standalone for development:

```bash
cd server
cp .env.example .env
# Edit .env with your API keys and auth tokens
npm install
npm run dev
```

Note: GraphicsMagick and Ghostscript are required for PDF processing:

```bash
# macOS
brew install graphicsmagick ghostscript

# Debian/Ubuntu (handled automatically in the Dockerfile)
apt-get install -y graphicsmagick ghostscript
```

### 4. Configure in ERPNext

1. Log in as Administrator
2. Navigate to **Invoice2Erpnext Settings**
3. Configure:
   - **Server URL**: `http://invoice-ocr:3000` (Docker) or `http://localhost:3000` (local dev)
   - **API Key / API Secret**: Must match `AUTH_TOKEN_KEY` / `AUTH_TOKEN_SECRET` from the server
   - **VAT Account Head**: Your tax account (e.g., `VAT - ABC`)
   - **Supplier Group**: Default group for new suppliers
   - **Item Group**: Default group for new items
   - **One Item Invoice**: Enable to consolidate all line items into one
4. Click **Test Connection** to verify

## Usage

### Processing Invoices

1. Navigate to the **Purchase Invoice** list view
2. Click the dropdown menu and select:
   - **Upload (Auto)**: Fully automatic - extracts supplier, items, and amounts
   - **Upload (Manual)**: Select a supplier and item, system extracts amounts only
3. Select your invoice/receipt files (PDF or images)
4. The system creates Purchase Invoices in draft status

### Processing Modes

- **Automatic Mode**: Extracts all information and creates Supplier, Items, and Purchase Invoice automatically. Best for clear, well-structured invoices.
- **Manual Mode**: You select the supplier and item; the system extracts only financial data. Useful for low-quality scans or unusual formats.

### Monitoring

Navigate to **Invoice2Erpnext Log** to view processing status:
- **Status**: Success or Error
- **Created Docs**: Links to created Purchase Invoices
- **Message**: Processing details or error messages

The original receipt file is automatically attached to the created Purchase Invoice.

## Testing the OCR Server

A test script is included to verify extraction quality without going through ERPNext:

```bash
cd server
npx tsx scripts/test-upload.ts /path/to/receipt.pdf

# See raw JSON response (as ERPNext receives it):
npx tsx scripts/test-upload.ts receipt.pdf --raw

# Custom server URL:
npx tsx scripts/test-upload.ts receipt.pdf --server http://invoice-ocr:3000
```

The test script shows extracted data with color-coded confidence scores and validates that amounts reconcile correctly.

## Multi-Currency Invoices

The plugin supports processing invoices in any currency, even when the supplier normally invoices in a different currency (e.g., a USD supplier sending a one-off CAD invoice). The AI extraction detects the invoice currency automatically and the plugin sets the correct `credit_to` (creditors/payable) account based on your currency-to-account mappings in **Invoice2Erpnext Settings**.

### Setup

Add a row in **Invoice2Erpnext Settings → Currency Accounts** for each currency you deal with, mapping it to the appropriate creditors account:

| Currency | Payable Account |
|----------|-----------------|
| CAD | Creditors CAD - ABC |
| USD | Creditors USD - ABC |

### How It Works

- New suppliers created by the plugin are **not locked to a single currency**. The plugin sets `credit_to` per-invoice based on the detected currency rather than relying on the supplier's default party account.
- For existing suppliers that already have GL entries in one currency, the plugin bypasses ERPNext's single-currency-per-supplier validation so the invoice can be created and submitted with the correct currency and creditors account.
- You can always override the detected currency using the currency selector in the upload dialog.

### Known Limitation

ERPNext enforces a one-currency-per-supplier model. The plugin bypasses this validation because the underlying GL entries are accounting-correct (each invoice posts against the right creditors account in the right currency with proper base-currency conversion). However, some ERPNext reports were not designed for suppliers with GL entries in multiple currencies:

- **Supplier Ledger Summary** and **General Ledger** (grouped by party): Base currency (company currency) totals are **always correct**. The "account currency" columns may show mixed-currency sums (e.g., USD + CAD added together) which are meaningless — this is a pre-existing ERPNext display limitation, not a data issue.
- **Accounts Payable**: Works correctly in base currency mode. The "In Party Currency" toggle may mix currencies for multi-currency suppliers.

This only affects suppliers that actually receive invoices in multiple currencies. Suppliers that consistently invoice in one currency are unaffected.

## Troubleshooting

- Check **Invoice2Erpnext Log** for error details
- Common issues:
  - Poor quality scans
  - Missing critical data (vendor name, date)
  - OCR server not reachable (check Server URL setting)
  - AI provider API key invalid or expired
- For best results, use clear scans with all critical information visible

## License

MIT - see [license.txt](license.txt)

Based on [invoice2erpnext](https://github.com/kainotomo/invoice2erpnext) by KAINOTOMO PH LTD.
