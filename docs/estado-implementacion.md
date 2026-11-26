# Estado de implementación

## Disponible

- Registro y aprobación de negocios, roles, asignación de viajes e historial.
- Altas, bajas y permisos por negocio. La eliminación confirmada revoca el acceso y conserva las operaciones y su historial. El registro detecta nombres equivalentes por mayúsculas y espacios.
- Apertura directa y solicitudes de viaje con devolución, corrección, aprobación y asignación al solicitante. La apertura registra los datos comerciales y del vehículo en dos pasos que conservan la captura al volver.
- Asignación de vehículo por administración o por un encargado del viaje. Las placas identifican al vehículo y se pueden reutilizar cuando termina el viaje anterior. El panel tiene **Solicitar viaje** en el encabezado y flechas de regreso.
- Acuerdos por viaje, estimaciones de merma, simulación de ofertas y tope de compra con reserva comercial. El historial muestra el tope conservador total y por tonelada de cada estimación. La sugerencia de reparto usa los kilos por productor y la primera estimación. La reserva pactada se captura por ticket.
- Tickets de finca, remisiones agrupadas por productor, remisión de entrega y cotejo del ticket de fábrica con el correo de recepción.
- Captura y aprobación de gastos, abonos al chofer, cierre operativo y cálculo de costo, merma y rentabilidad.
- Captura de gastos generales con importes independientes, un concepto opcional y beneficiario editable precargado con el correo del encargado asignado.

## Verificación

En la primera versión local se verificaron Supabase en el Mac, autenticación, aislamiento entre negocios y captura por un encargado asignado. Las pruebas operativas comprobaron el tope conservador de $3,032.50 por tonelada, la reserva de $750 y $500 por productor y el saldo de $12,000 sobre un flete de $20,000 con $8,000 de adelanto.

Con Supabase local y las cuentas de demostración se verificaron el registro simultáneo de nombres equivalentes, la revocación de permisos, el aislamiento de solicitudes entre negocios, la aprobación simultánea sin duplicar el viaje, la captura de gastos por el encargado asignado y la eliminación confirmada. En el navegador se verificaron los tipos de vehículo, el regreso entre pasos y la conservación de la captura al cancelar la salida.

En Supabase local también se verificaron la asignación de vehículo por ambos roles, el rechazo de usuarios ajenos al viaje, el bloqueo de placas ocupadas y el registro separado de cada importe con el beneficiario editado.

La migración conserva las coincidencias de nombre históricas y habilita la gestión de encargados para administradores existentes. Las cuentas administrativas nuevas requieren el permiso del superadministrador. Los viajes anteriores con acuerdos conservan el acceso a su expediente. Los viajes anteriores sin acuerdos requieren completar la apertura.

## Pendiente

- Exportación de datos y reportes por negocio.
- Catálogos y tarifas sugeridas, evidencias adjuntas y cancelación con traslado de gastos o adelantos.
- Facturas agrupadas, cobros diferenciados de producto y flete, depósitos y adelantos del cliente.
- Expediente fiscal, custodia de XML y conciliación contable.

Consulta los criterios de aceptación de cada módulo en el [análisis funcional](analisis-funcional.md).
