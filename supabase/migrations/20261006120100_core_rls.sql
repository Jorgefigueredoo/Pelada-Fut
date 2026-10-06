-- Phase 1: RLS. Nothing below depends on the UI hiding a button.

-- Helpers used by the policies. They are security definer so a policy on profiles
-- does not have to read profiles through its own policy (infinite recursion).
create or replace function public.is_approved()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.status = 'approved'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.status = 'approved'
       and p.role = 'admin'
  );
$$;

revoke all on function public.is_approved() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- The trigger functions are called by the trigger, never by a client.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_player_email() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.player_admin_data enable row level security;
alter table public.app_settings enable row level security;

-- No client ever writes to these tables directly: the only path is a function.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
revoke insert, update, delete, truncate on public.player_admin_data from anon, authenticated;
revoke insert, update, delete, truncate on public.app_settings from anon, authenticated;
revoke all on public.profiles from anon;
revoke all on public.player_admin_data from anon;
revoke all on public.app_settings from anon;

-- A pending or blocked user reads nothing but their own profile.
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

-- Stars and email: admin only. Not even the owner reads their own stars.
create policy player_admin_data_select_admin on public.player_admin_data
  for select to authenticated
  using (public.is_admin());

create policy app_settings_select_admin on public.app_settings
  for select to authenticated
  using (public.is_admin());
