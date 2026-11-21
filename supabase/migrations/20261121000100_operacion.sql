alter table campo.trips
  add column acuerdos jsonb,
  add column cerrado_en timestamptz;

create table campo.planes (
  id bigint generated always as identity primary key,
  viaje uuid not null references campo.trips(id),
  kg numeric(14,3) not null check (kg > 0),
  merma numeric(7,4) not null check (merma between 0 and 100),
  gastos numeric(14,2) not null check (gastos >= 0),
  oferta numeric(14,4) check (oferta >= 0),
  creado_en timestamptz not null default now()
);

create table campo.compras (
  id uuid primary key default gen_random_uuid(),
  viaje uuid not null references campo.trips(id),
  folio text not null,
  finca text not null,
  productor text not null,
  variedad text not null,
  kg numeric(14,3) not null check (kg > 0),
  tarifa numeric(14,4) not null check (tarifa >= 0),
  reserva numeric(14,2) not null check (reserva >= 0),
  importe numeric(14,2) generated always as (round(kg * tarifa / 1000,2)) stored,
  unique(viaje, finca, folio),
  unique(viaje, id)
);

create table campo.gastos (
  id uuid primary key default gen_random_uuid(),
  viaje uuid not null references campo.trips(id),
  ticket uuid,
  concepto text not null,
  fecha date not null,
  beneficiario text not null,
  tarifa numeric(14,4),
  importe numeric(14,2) not null check (importe >= 0),
  origen text not null,
  motivo text,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','devuelto')),
  foreign key (viaje, ticket) references campo.compras(viaje, id),
  unique(ticket, concepto)
);

create table campo.recepciones (
  viaje uuid primary key references campo.trips(id),
  negocio uuid not null,
  cliente text not null,
  folio text not null,
  sap text not null,
  orden text not null,
  fecha date not null,
  kg_correo numeric(14,3) not null check (kg_correo > 0),
  venta numeric(14,2) not null check (venta >= 0),
  foreign key (negocio, viaje) references campo.trips(business_id, id),
  unique(negocio, cliente, sap)
);

create table campo.abonos_chofer (
  id uuid primary key default gen_random_uuid(),
  viaje uuid not null references campo.trips(id),
  fecha date not null,
  importe numeric(14,2) not null check (importe > 0),
  referencia text not null
);

create table campo.remisiones_entrega (
  viaje uuid primary key,
  negocio uuid not null,
  folio text not null,
  fecha date not null,
  kg numeric(14,3) not null check (kg > 0),
  unique(negocio, folio),
  foreign key (negocio, viaje) references campo.trips(business_id,id)
);

create table campo.tickets_fabrica (
  viaje uuid primary key references campo.remisiones_entrega(viaje),
  folio text not null,
  fecha date not null,
  kg numeric(14,3) not null check (kg > 0)
);
