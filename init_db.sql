-- Enable necessary extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Clean up existing tables (ORDER MATTERS due to foreign keys)
drop table if exists jobs cascade;
drop table if exists invoice_flags cascade;
drop table if exists extractions cascade;
drop table if exists invoice_pages cascade;
drop table if exists invoices cascade;
drop table if exists workspaces cascade;
drop table if exists fiscal_years cascade;
drop table if exists companies cascade;
drop table if exists pending_invites cascade;
drop table if exists memberships cascade;
drop table if exists firms cascade;

-- 1. Firms
create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 2. Memberships
create table memberships (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique(firm_id, user_id)
);

-- 3. Pending Invites
create table pending_invites (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique(firm_id, email)
);

-- 4. Companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- 5. Fiscal Years
create table fiscal_years (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique(company_id, label)
);

-- 6. Workspaces
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  fiscal_year_id uuid not null references fiscal_years(id) on delete cascade,
  is_locked boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, fiscal_year_id)
);

-- 7. Invoices
create table invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  vendor_name_en text,
  invoice_number_en text,
  invoice_date_raw text,
  invoice_date_iso date,
  taxable_amount numeric,
  vat_amount numeric,
  grand_total numeric,
  currency text default 'NPR',
  line_items jsonb,
  other_charges jsonb,
  merge_key text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8. Invoice Pages
create table invoice_pages (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  page_no int not null,
  storage_bucket text not null default 'invoices',
  storage_path text not null,
  mime_type text,
  created_at timestamptz not null default now(),
  unique(invoice_id, page_no)
);

-- 9. Extractions
create table extractions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  model text default 'gemini-1.5-flash',
  extracted_json jsonb,
  raw_text text,
  confidence numeric,
  created_at timestamptz not null default now()
);

-- 10. Invoice Flags
create table invoice_flags (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  math_mismatch boolean,
  vat_inconsistent boolean,
  missing_fields boolean,
  duplicate_invoice boolean,
  notes text,
  created_at timestamptz not null default now(),
  unique(invoice_id)
);

-- 11. Jobs
create table jobs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  type text default 'extract',
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts int default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

--------------------------------------------------
-- INDEXES
--------------------------------------------------
create index idx_memberships_user_id on memberships(user_id);
create index idx_companies_firm_id on companies(firm_id);
create index idx_workspaces_firm_id on workspaces(firm_id);
create index idx_invoices_workspace_id on invoices(workspace_id);
create index idx_invoices_merge_key on invoices(merge_key);
create index idx_invoices_invoice_number_en on invoices(invoice_number_en);
create index idx_jobs_status on jobs(status);

--------------------------------------------------
-- RLS POLICIES
--------------------------------------------------
-- 1. Enable RLS
alter table firms enable row level security;
alter table memberships enable row level security;
alter table pending_invites enable row level security;
alter table companies enable row level security;
alter table fiscal_years enable row level security;
alter table workspaces enable row level security;
alter table invoices enable row level security;
alter table invoice_pages enable row level security;
alter table extractions enable row level security;
alter table invoice_flags enable row level security;
alter table jobs enable row level security;

-- 2. Policies

-- Firms: Member Access
create policy "Members can view their firm"
  on firms for select
  using (
    exists (
      select 1 from memberships m
      where m.firm_id = firms.id
      and m.user_id = auth.uid()
    )
  );

-- Memberships: Self Access
create policy "Users can view their own membership"
  on memberships for select
  using (
    auth.uid() = user_id
  );

-- Pending Invites: Admin Access
create policy "Admins can manage invites"
  on pending_invites for all
  using (
    exists (
      select 1 from memberships m
      where m.firm_id = pending_invites.firm_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
    )
  );

-- Companies: Firm Member Access
create policy "Firm members can view companies"
  on companies for select
  using (
    exists (
      select 1 from memberships m
      where m.firm_id = companies.firm_id
      and m.user_id = auth.uid()
    )
  );

-- Fiscal Years: Firm Member Access (via Company -> Firm)
create policy "Firm members can view fiscal years"
  on fiscal_years for select
  using (
    exists (
      select 1 from companies c
      join memberships m on c.firm_id = m.firm_id
      where c.id = fiscal_years.company_id
      and m.user_id = auth.uid()
    )
  );

-- Workspaces: Firm Member Access
create policy "Firm members can view workspaces"
  on workspaces for select
  using (
    exists (
      select 1 from memberships m
      where m.firm_id = workspaces.firm_id
      and m.user_id = auth.uid()
    )
  );

-- Invoices: Workspace Member Access
create policy "Workspace (Firm) members can view invoices"
  on invoices for select
  using (
    exists (
      select 1 from workspaces w
      join memberships m on w.firm_id = m.firm_id
      where w.id = invoices.workspace_id
      and m.user_id = auth.uid()
    )
  );
  
-- Invoice Pages: Linked Access
create policy "Firm members can view invoice pages"
  on invoice_pages for select
  using (
    exists (
      select 1 from invoices i
      join workspaces w on i.workspace_id = w.id
      join memberships m on w.firm_id = m.firm_id
      where i.id = invoice_pages.invoice_id
      and m.user_id = auth.uid()
    )
  );

-- Extractions: Linked Access
create policy "Firm members can view extractions"
  on extractions for select
  using (
    exists (
      select 1 from invoices i
      join workspaces w on i.workspace_id = w.id
      join memberships m on w.firm_id = m.firm_id
      where i.id = extractions.invoice_id
      and m.user_id = auth.uid()
    )
  );

-- Invoice Flags: Linked Access
create policy "Firm members can view invoice flags"
  on invoice_flags for select
  using (
    exists (
      select 1 from invoices i
      join workspaces w on i.workspace_id = w.id
      join memberships m on w.firm_id = m.firm_id
      where i.id = invoice_flags.invoice_id
      and m.user_id = auth.uid()
    )
  );

-- Jobs: Linked Access
create policy "Firm members can view jobs"
  on jobs for select
  using (
    exists (
      select 1 from invoices i
      join workspaces w on i.workspace_id = w.id
      join memberships m on w.firm_id = m.firm_id
      where i.id = jobs.invoice_id
      and m.user_id = auth.uid()
    )
  );
  
--------------------------------------------------
-- STORAGE
--------------------------------------------------
-- Create the bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- Storage Policies
-- We need to handle RLS on storage.objects
-- Allow read if user is member of the firm that owns the invoice linked to the file (path)
-- Path format assumed: {invoice_id}/{page_no}.{ext} or similar.
-- Or we just check memberships simplistically for now? 
-- "files stored by invoice_pages.storage_path"
-- We can link back using the path.
-- Policy: "Give access to objects if user is in the firm"
-- Note: 'storage.objects' RLS is complex. simpler to allow authenticated users to read if they have the path? 
-- No, "invoice_pages, extractions, flags, jobs are accessible ONLY via workspace → firm membership".
-- We'll try to join storage.objects to invoice_pages?
-- This is hard because storage.objects doesn't have a direct FK. name = storage_path.
-- We'll use a simplified policy for now: allow authenticated uploads/selects if they are part of *any* firm?
-- No, must be strict.
-- "files stored by invoice_pages.storage_path"
-- Let's assume the path contains the firm_id or workspace_id? No, prompt doesn't say.
-- We will use a policy that checks if the record exists in invoice_pages.
create policy "MarketShield Invoices Access"
on storage.objects for select
using (
  bucket_id = 'invoices'
  and exists (
    select 1 from invoice_pages ip
    join invoices i on ip.invoice_id = i.id
    join workspaces w on i.workspace_id = w.id
    join memberships m on w.firm_id = m.firm_id
    where ip.storage_path = storage.objects.name
    and m.user_id = auth.uid()
  )
);

create policy "MarketShield Invoices Upload"
on storage.objects for insert
with check (
  bucket_id = 'invoices'
  and auth.role() = 'authenticated'
);

--------------------------------------------------
-- SEED ADMIN USER
--------------------------------------------------
do $$
declare
  new_user_id uuid := gen_random_uuid();
  new_firm_id uuid := gen_random_uuid();
begin
  -- 1. Create User in auth.users (if not exists)
  if not exists (select 1 from auth.users where email = 'ace.bista@gmail.com') then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'ace.bista@gmail.com',
      crypt('Sachu123!', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{}',
      now(),
      now(),
      '',
      ''
    );
    
    -- 2. Create Initial Firm
    insert into firms (id, name)
    values (new_firm_id, 'Default Firm');

    -- 3. Create Membership (Admin)
    insert into memberships (firm_id, user_id, role)
    values (new_firm_id, new_user_id, 'admin');
    
  end if;
end $$;
