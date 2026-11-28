alter table campo.gastos
  drop constraint gastos_base_unitaria_valida,
  add constraint gastos_base_unitaria_valida check (
    (cantidad is null and tarifa_unitaria is null) or
    (cantidad is not null and tarifa_unitaria is not null and cantidad > 0 and tarifa_unitaria > 0
      and concepto in ('canastos','escalera','flete local','pasaje','mandados','combustible propio','agua','lonches','otro'))
  );
