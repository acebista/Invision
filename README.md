# InvoiceVision

Invoice ingestion and extraction system built with Next.js, Supabase, and Gemini 1.5 Flash.

## Architecture

```
invoicevision/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── bootstrap/route.ts    # First-time system setup
│   │   │   └── invite/route.ts       # Invite new users
│   │   ├── auth/
│   │   │   └── accept-invite/route.ts # Accept pending invite
│   │   ├── export/
│   │   │   ├── csv/route.ts          # Export invoices as CSV
│   │   │   └── excel/route.ts        # Export invoices as XLSX
│   │   ├── invoices/
│   │   │   ├── route.ts              # GET: List invoices
│   │   │   ├── create/route.ts       # POST: Create invoice with pages
│   │   │   ├── finalize/route.ts     # POST: Trigger extraction
│   │   │   ├── approve/route.ts      # POST: Approve invoice
│   │   │   └── status/route.ts       # GET: Invoice status
│   │   └── workspaces/route.ts       # GET/POST: Workspaces
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── InvoiceUploader.tsx           # Upload UI with preview
│   └── CropEditor.tsx                # Manual crop adjustment
├── hooks/
│   └── useInvoiceUpload.ts           # Upload flow hooks
├── lib/
│   ├── supabaseAdmin.ts              # Service role client (server-only)
│   ├── supabaseClient.ts             # Anon client (browser-safe)
│   ├── auth.ts                       # Auth helpers
│   ├── normalization.ts              # Nepali→Arabic, merge key
│   ├── validation.ts                 # Invoice flag computation
│   ├── imageProcessing.ts            # EXIF, crop, deskew, compress
│   └── pdfProcessing.ts              # PDF to image conversion
├── supabase/
│   └── functions/
│       └── process-invoice/
│           ├── index.ts              # Edge Function: Gemini extraction
│           └── deno.json
├── package.json
├── next.config.mjs
├── tsconfig.json
└── .env.example
```

## API Reference

### Authentication

All API routes (except bootstrap) require `Authorization: Bearer <token>` header.

### Admin Endpoints

#### `POST /api/admin/bootstrap`
First-time setup. Creates firm and makes caller admin.
```json
{ "userId": "uuid", "email": "user@example.com" }
```

#### `POST /api/admin/invite`
Invite user to firm (admin only).
```json
{ "email": "newuser@example.com", "firmId": "uuid" }
```

### Workspace Endpoints

#### `GET /api/workspaces`
List all workspaces for user's firm.

#### `POST /api/workspaces`
Create new workspace.
```json
{ "companyName": "ACME Corp", "fiscalYearLabel": "2080/81" }
```

### Invoice Endpoints

#### `GET /api/invoices?workspaceId=xxx&status=pending_review`
List invoices in workspace.

#### `POST /api/invoices/create`
Upload invoice with pages.
```json
{
  "workspaceId": "uuid",
  "pages": [
    { "base64": "...", "mimeType": "image/jpeg", "pageNo": 1 }
  ]
}
```

#### `POST /api/invoices/finalize`
Trigger Gemini extraction.
```json
{ "invoiceId": "uuid" }
```

#### `GET /api/invoices/status?invoiceId=xxx`
Get invoice status with extraction, flags, and job info.

#### `POST /api/invoices/approve`
Mark invoice as approved.
```json
{ "invoiceId": "uuid" }
```

### Export Endpoints

#### `POST /api/export/csv`
Export approved invoices as CSV.
```json
{ "workspaceId": "uuid", "force": false }
```

#### `POST /api/export/excel`
Export approved invoices as XLSX.
```json
{ "workspaceId": "uuid", "force": false }
```

## Supabase Edge Function

### `process-invoice`

Deployed to Supabase Edge Functions. Handles:
1. Downloading invoice page from storage
2. Calling Gemini 1.5 Flash Vision
3. Normalizing extracted data (Nepali→Arabic)
4. Computing merge key
5. Auto-merging duplicate invoices
6. Validating (math, VAT, missing fields)
7. Saving extraction and flags

**Deploy:**
```bash
supabase functions deploy process-invoice --project-ref vzwxvjeuzayvkceoybve
```

**Required Secrets:**
```bash
supabase secrets set GEMINI_API_KEY=your_key --project-ref vzwxvjeuzayvkceoybve
```

## Merge Logic

Invoices are AUTO-MERGED when ALL match:
- Same workspace
- Same vendor name (normalized, lowercase)
- Same invoice number
- Same invoice date (ISO)

**Merge Key Format:**
```
{workspace_id}|{vendor_normalized}|{invoice_num}|{date_iso}
```

When merged:
- Pages are moved to existing invoice
- Duplicate invoice record is deleted
- Original extraction preserved

## Validation Flags

| Flag | Condition |
|------|-----------|
| `missing_fields` | Vendor, number, or date is null |
| `math_mismatch` | `taxable + vat != total` (±2 tolerance) |
| `vat_inconsistent` | `vat != taxable * 0.13` (±2 tolerance) |
| `duplicate_invoice` | Merge key exists but merge not possible |

## Environment Variables

```env
# Public (exposed to browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx

# Server-only (NEVER expose)
SUPABASE_SERVICE_ROLE_KEY=xxx
GEMINI_API_KEY=xxx
```

## Security

- `SUPABASE_SERVICE_ROLE_KEY` never exposed to client
- All API routes validate membership before access
- RLS enforced on all tables
- Edge Function uses service key internally
- Storage policies enforce firm-level access

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your keys

# Run development server
npm run dev

# Deploy Edge Function
supabase functions deploy process-invoice
```
