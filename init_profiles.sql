-- 1. Create Profiles Table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Enable RLS
alter table public.profiles enable row level security;

-- 3. RLS Policies

-- Self Access: Users can view/edit their own profile
create policy "Users can view own profile" 
  on profiles for select 
  using (auth.uid() = id);

create policy "Users can update own profile" 
  on profiles for update 
  using (auth.uid() = id);

-- Firm Fellow Access: Users can view profiles of people in the same firm
-- This is technically a "many-to-many" check via memberships.
-- If I am in Firm A, I can see profiles of all UserIDs in Firm A.
create policy "Users can view profiles of fellow firm members"
  on profiles for select
  using (
    exists (
      select 1 from memberships my_m
      join memberships their_m on my_m.firm_id = their_m.firm_id
      where my_m.user_id = auth.uid()
      and their_m.user_id = profiles.id
    )
  );

-- 4. Trigger Function to auto-create profile on signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

-- 5. Trigger
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. Backfill existing users (specifically the admin we just made)
insert into public.profiles (id, email, full_name)
select 
  id, 
  email, 
  raw_user_meta_data->>'full_name'
from auth.users
on conflict (id) do nothing;
