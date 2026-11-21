---
name: ponitero-operacion
description: Implementa o revisa reglas de compras, gastos, recepción, rentabilidad, cierre y conciliación de viajes en ponitero. Úsala cuando cambien cálculos, permisos o el expediente operativo.
---

# Reglas de operación de ponitero

Consulta [el análisis funcional](../../../docs/analisis-funcional.md) para identificar la regla y su caso de aceptación. Revisa [el estado de implementación](../../../docs/estado-implementacion.md) para ubicar el alcance disponible.

- Controla permisos y alcance por negocio en la API. El encargado captura gastos en viajes asignados, mientras administración revisa gastos y administra la operación. Los cambios privilegiados registran actor y motivo.
- Usa pesos en kg y tarifas por tonelada métrica. Calcula con decimales de PostgreSQL y conserva los importes pactados. El tope comercial usa la meta del 30 % sobre producto y flete del cliente. El tope conservador resta el 1.25 % sobre venta estimada de producto.
- Usa el ticket de fábrica para el flete del chofer. Coteja su peso con el correo para confirmar la venta. El costo incluye el flete completo y los gastos aprobados. Los abonos al chofer reducen su saldo.
- Comprueba los cálculos con los casos de aceptación del análisis. Si cambian permisos, verifica al menos un encargado asignado y un usuario de otro negocio.
