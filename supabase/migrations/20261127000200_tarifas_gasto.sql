create table campo.tarifas_gasto (
  negocio uuid not null references campo.businesses(id),
  ambito text not null check (ambito in ('viaje','finca','productor')),
  referencia text not null check (btrim(referencia) <> ''),
  concepto text not null check (concepto in ('corte','estiba','flete local','vaciado','pasaje')),
  tarifa numeric(14,4) not null check (tarifa >= 0),
  primary key (negocio,ambito,referencia,concepto)
);
