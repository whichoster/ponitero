create schema campo;
revoke all on schema campo from public, anon, authenticated;

create table campo.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  owner_id uuid not null unique references auth.users(id),
  status text not null default 'pendiente' check (status in ('pendiente','aprobado','suspendido')),
  created_at timestamptz not null default now()
);
create table campo.platform_admins (
  user_id uuid primary key references auth.users(id)
);
create table campo.members (
  business_id uuid references campo.businesses(id),
  user_id uuid references auth.users(id),
  role text not null check (role in ('administrador','encargado')),
  primary key (business_id, user_id)
);
create table campo.trips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references campo.businesses(id),
  reference text not null,
  customer text not null,
  created_at timestamptz not null default now(),
  unique (business_id, reference),
  unique (business_id, id)
);
create table campo.assignments (
  business_id uuid not null,
  trip_id uuid not null,
  user_id uuid not null,
  primary key (trip_id, user_id),
  foreign key (business_id, trip_id) references campo.trips(business_id, id),
  foreign key (business_id, user_id) references campo.members(business_id, user_id)
);
create table campo.audit (
  id bigint generated always as identity primary key,
  business_id uuid not null references campo.businesses(id),
  actor_id uuid not null references auth.users(id),
  action text not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);
