alter table campo.businesses add column deleted_at timestamptz;
alter table campo.businesses drop constraint businesses_owner_id_key;
create unique index businesses_active_owner on campo.businesses(owner_id) where deleted_at is null;

create function campo.business_name_key(text) returns text
language sql immutable strict parallel safe
as $$ select lower(btrim(regexp_replace($1, '[[:space:]]+', ' ', 'g'))) $$;

create index businesses_active_name on campo.businesses(campo.business_name_key(name)) where deleted_at is null;

-- Conserva las coincidencias históricas y reserva cada nombre para las altas concurrentes.
create table campo.business_names (
  name_key text primary key,
  active_count bigint not null check (active_count >= 0)
);
insert into campo.business_names (name_key,active_count)
  select campo.business_name_key(name),count(*) from campo.businesses
  where deleted_at is null group by 1;

create function campo.sync_business_name() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is null then
    if new.deleted_at is null and campo.business_name_key(old.name) = campo.business_name_key(new.name) then
      return new;
    end if;
    update campo.business_names set active_count=active_count-1
      where name_key=campo.business_name_key(old.name);
  end if;

  if new.deleted_at is null then
    insert into campo.business_names (name_key,active_count) values (campo.business_name_key(new.name),1)
      on conflict (name_key) do update set active_count=1
      where campo.business_names.active_count=0;
    if not found then
      raise unique_violation using message = 'Ya existe un negocio con ese nombre',
        constraint = 'businesses_active_name';
    end if;
  end if;
  return new;
end;
$$;

create trigger sync_business_name before insert or update of name,deleted_at on campo.businesses
  for each row execute function campo.sync_business_name();

alter table campo.members add column can_manage_workers boolean not null default false;
update campo.members set can_manage_workers=true where role='administrador';
alter table campo.members add check (not can_manage_workers or role='administrador');

alter table campo.trips add column apertura jsonb;

create table campo.trip_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references campo.businesses(id),
  requester_id uuid not null references auth.users(id),
  datos jsonb not null,
  status text not null default 'pendiente' check (status in ('pendiente','devuelta','aprobada')),
  reason text,
  trip_id uuid unique,
  created_at timestamptz not null default now(),
  foreign key (business_id, trip_id) references campo.trips(business_id,id),
  check ((status='aprobada') = (trip_id is not null)),
  check ((status='devuelta') = (reason is not null))
);
create index trip_requests_business on campo.trip_requests(business_id, requester_id);
