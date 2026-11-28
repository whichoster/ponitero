alter table campo.gastos
  add column cantidad integer,
  add column tarifa_unitaria numeric(11,2),
  add constraint gastos_base_unitaria_valida check (
    (cantidad is null and tarifa_unitaria is null) or
    (cantidad is not null and tarifa_unitaria is not null and cantidad > 0 and tarifa_unitaria > 0
      and concepto in ('canastos','escalera'))
  );
