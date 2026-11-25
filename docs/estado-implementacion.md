# Estado de implementación

## Disponible

- Registro y aprobación de negocios, roles, asignación de viajes e historial.
- Acuerdos por viaje, estimaciones de merma, simulación de ofertas y tope de compra con reserva comercial. El historial muestra el tope conservador total y por tonelada de cada estimación. La sugerencia de reparto usa los kilos por productor y la primera estimación. La reserva pactada se captura por ticket.
- Tickets de finca, remisiones agrupadas por productor, remisión de entrega y cotejo del ticket de fábrica con el correo de recepción.
- Captura y aprobación de gastos, abonos al chofer, cierre operativo y cálculo de costo, merma y rentabilidad.

## Verificación

En la primera versión local se verificaron Supabase en el Mac, autenticación, aislamiento entre negocios y captura por un encargado asignado. Las pruebas operativas comprobaron el tope conservador de $3,032.50 por tonelada, la reserva de $750 y $500 por productor y el saldo de $12,000 sobre un flete de $20,000 con $8,000 de adelanto.

## Pendiente

- Gestión de altas, bajas y permisos por negocio, eliminación confirmada y validación de nombres duplicados.
- Solicitudes de viaje por encargados, validación de los nuevos datos de apertura y navegación con conservación de la captura.
- Catálogos y tarifas sugeridas, evidencias adjuntas y cancelación con traslado de gastos o adelantos.
- Facturas agrupadas, cobros diferenciados de producto y flete, depósitos y adelantos del cliente.
- Expediente fiscal, custodia de XML y conciliación contable.

Consulta los criterios de aceptación de cada módulo en el [análisis funcional](analisis-funcional.md).
