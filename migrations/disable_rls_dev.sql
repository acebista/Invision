-- Migration: Disable RLS for development (Allows Anon Public Access)
-- WARNING: This is for development only. Re-enable RLS before production.

ALTER TABLE firms DISABLE ROW LEVEL SECURITY;
ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_flags DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_pages DISABLE ROW LEVEL SECURITY;

-- Alternatively, if we want to keep RLS enabled but allow anon access:
-- CREATE POLICY "Public Access" ON companies FOR ALL USING (true);
-- But disabling is cleaner for "dev mode".
