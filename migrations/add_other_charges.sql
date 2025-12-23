-- Migration: Add other_charges column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS other_charges JSONB;

COMMENT ON COLUMN invoices.other_charges IS 'Array of other charges like Service Charge, Freight, Discount, etc. [{name: "Service Charge", amount: 185}]';
