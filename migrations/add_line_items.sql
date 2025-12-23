-- Migration: Add line_items column to invoices table
-- Run this if you already have an existing database

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB;

COMMENT ON COLUMN invoices.line_items IS 'Array of line items with description, quantity, unit_price, and amount';
