alter table campo.tickets_fabrica drop constraint tickets_fabrica_viaje_fkey;
alter table campo.tickets_fabrica add foreign key (viaje) references campo.trips(id);

create table campo.consecutivos_remision_entrega (
  negocio uuid primary key references campo.businesses(id),
  ultimo numeric not null check (ultimo >= 1 and trunc(ultimo)=ultimo)
);
insert into campo.consecutivos_remision_entrega (negocio,ultimo)
select negocio, greatest(1,max(substring(folio from 3)::numeric))
from campo.remisiones_entrega where folio ~ '^F-[1-9][0-9]*$' group by negocio;

alter table campo.trips add column reasignado_en timestamptz;
alter table campo.trip_requests
  drop constraint trip_requests_status_check,
  drop constraint trip_requests_check1,
  add column version integer not null default 1,
  add column source_trip_id uuid unique,
  add foreign key (business_id,source_trip_id) references campo.trips(business_id,id),
  add check (status in ('pendiente','devuelta','aprobada','cancelada','pendiente_correccion')),
  add check ((status in ('devuelta','cancelada','pendiente_correccion')) = (reason is not null));
