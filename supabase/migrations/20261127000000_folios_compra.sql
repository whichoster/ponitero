alter table campo.trips add column consecutivo_compra bigint;

with numerados as (
  select id, row_number() over (partition by business_id order by created_at, id) numero
  from campo.trips
)
update campo.trips t set consecutivo_compra=n.numero from numerados n where n.id=t.id;

alter table campo.trips alter column consecutivo_compra set not null,
  add unique (business_id, consecutivo_compra);

create table campo.consecutivos_compra (
  negocio uuid primary key references campo.businesses(id),
  ultimo bigint not null
);

insert into campo.consecutivos_compra
select business_id,max(consecutivo_compra) from campo.trips group by business_id;

create function campo.asignar_consecutivo_compra() returns trigger
language plpgsql as $$
begin
  insert into campo.consecutivos_compra(negocio,ultimo) values(new.business_id,1)
    on conflict (negocio) do update set ultimo=campo.consecutivos_compra.ultimo+1
    returning ultimo into new.consecutivo_compra;
  return new;
end;
$$;

create trigger consecutivo_compra before insert on campo.trips
for each row execute function campo.asignar_consecutivo_compra();

create table campo.remisiones_compra (
  viaje uuid not null references campo.trips(id),
  productor text not null,
  sufijo bigint not null,
  primary key (viaje,productor),
  unique (viaje,sufijo)
);

insert into campo.remisiones_compra
select viaje,productor,row_number() over (partition by viaje order by productor)
from (select distinct viaje,productor from campo.compras) productores;

alter table campo.compras
  add foreign key (viaje,productor) references campo.remisiones_compra(viaje,productor),
  add column version integer not null default 1;

alter table campo.gastos add column requiere_revision_ticket boolean not null default false;
