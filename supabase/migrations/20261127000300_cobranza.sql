create table campo.documentos_cobro (
  id uuid primary key default gen_random_uuid(),
  negocio uuid not null references campo.businesses(id),
  cliente text not null,
  concepto text not null check (concepto in ('producto','flete')),
  referencia text not null,
  fecha date not null,
  fecha_envio date,
  unique (negocio,concepto,referencia),
  unique (negocio,id,cliente,concepto)
);

create table campo.lineas_cobro (
  negocio uuid not null,
  documento uuid not null,
  cliente text not null,
  concepto text not null,
  viaje uuid not null,
  importe numeric(16,2) not null check (importe > 0),
  retencion numeric(16,2) not null default 0 check (retencion >= 0 and retencion <= importe),
  primary key (documento,viaje),
  unique (negocio,concepto,viaje),
  foreign key (negocio,viaje) references campo.trips(business_id,id),
  foreign key (negocio,documento,cliente,concepto) references campo.documentos_cobro(negocio,id,cliente,concepto)
);

create table campo.fondos_cliente (
  id uuid primary key default gen_random_uuid(),
  negocio uuid not null references campo.businesses(id),
  cliente text not null,
  tipo text not null check (tipo in ('deposito','adelanto')),
  referencia text not null,
  fecha date not null,
  temporada text,
  importe numeric(16,2) not null check (importe > 0),
  check ((tipo='adelanto') = (temporada is not null)),
  unique (negocio,cliente,tipo,referencia),
  unique (negocio,id)
);

create table campo.movimientos_cobro (
  id uuid primary key default gen_random_uuid(),
  negocio uuid not null,
  fondo uuid not null,
  documento uuid references campo.documentos_cobro(id),
  viaje uuid,
  importe numeric(16,2) not null check (importe > 0),
  referencia text not null,
  fecha date not null,
  check (viaje is null or documento is not null),
  foreign key (negocio,fondo) references campo.fondos_cliente(negocio,id),
  foreign key (documento,viaje) references campo.lineas_cobro(documento,viaje),
  unique (fondo,referencia)
);

create view campo.saldos_linea_cobro as
select l.*, coalesce(a.pagado,0) aplicado, l.importe-l.retencion-coalesce(a.pagado,0) saldo
from campo.lineas_cobro l
left join lateral (
  select sum(m.importe) pagado from campo.movimientos_cobro m
  where m.documento=l.documento and m.viaje=l.viaje
) a on true;

create view campo.saldos_documento_cobro as
select d.*, l.total,l.retencion,l.saldo-coalesce(a.aplicado,0) saldo,
  coalesce(a.aplicado,0) adelanto_agrupado
from campo.documentos_cobro d
cross join lateral (
  select sum(importe) total, sum(retencion) retencion, sum(saldo) saldo
  from campo.saldos_linea_cobro where documento=d.id
) l
left join lateral (
  select sum(importe) aplicado from campo.movimientos_cobro where documento=d.id and viaje is null
) a on true;

create view campo.saldos_fondo_cliente as
select f.*, f.importe-coalesce(m.usado,0) saldo
from campo.fondos_cliente f
left join lateral (select sum(importe) usado from campo.movimientos_cobro where fondo=f.id) m on true;
