

export enum InvoiceStatus {
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export interface InvoiceFlags {
  math_mismatch: boolean;
  vat_inconsistent: boolean;
  missing_fields: boolean;
}

export interface LineItem {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

export interface OtherCharge {
  name: string;
  amount: number;
}

export interface InvoiceData {
  invoice_id: string;
  company_id: string;
  fiscal_year: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date_raw: string | null;
  taxable_amount: number | null;
  vat_amount: number | null;
  grand_total: number | null;
  currency: string;
  line_items?: LineItem[];
  other_charges?: OtherCharge[];
  flags: InvoiceFlags;
  status: InvoiceStatus;
  confidence_score: number;
  image_urls: string[];
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
}

export interface FiscalYear {
  id: string;
  label: string;
}
