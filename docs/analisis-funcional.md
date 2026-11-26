# ponitero · Análisis funcional y definición de la aplicación

**Alcance.** Este documento conserva la definición funcional entregada para el proyecto. El estado actual de implementación y verificación se mantiene en [Estado de implementación](estado-implementacion.md).

## 1. Evidencia y estado del proyecto

| Fuente | Alcance |
|---|---|
| Conversación y cuaderno | Reglas aprobadas y ejemplo independiente de captura manual. |
| Correos y CFDI de Sabormex | Casos documentales de recepción, consolidación y conciliación. |
| Código local de ponitero | Primer bloque con registro y aprobación de negocios, roles, viajes asignados e historial. |
| Sitio en la nube | El alojamiento futuro está definido. El proyecto sigue en etapa local. |

**Implementado en el primer bloque.** Registro de cuentas y negocios, aprobación y suspensión, superadministrador, administrador y encargado, alta y asignación de viajes, aislamiento por negocio e historial de operaciones. Los flujos de tickets, costos, remisiones, cobros y adelantos se especifican en este documento para los siguientes bloques.

## 2. Objetivo y participantes

El **viaje** concentra los ingresos, costos, documentos y pagos de una entrega. La aplicación debe responder cuánto se puede ofrecer al productor antes de comprar, cuánto dejó efectivamente el viaje y cuánto queda por pagar o cobrar.

| Participante | Función |
|---|---|
| Productor o proveedor | Vende la piña. Puede haber varias compras y remisiones de compra por viaje, incluso del mismo productor. |
| Empresa compradora, por ejemplo Sabormex | Pacta el precio del producto por viaje, recibe y pesa la carga, confirma el importe a facturar por correo y paga. Puede acordar un importe de flete por tonelada entregada, exigible por separado. |
| Chofer o transportista | Pacta una tarifa por tonelada recibida, recibe un adelanto, entrega el ticket de fábrica y cobra el saldo. |
| Cuadrilla y otros prestadores | Reciben pagos por corte, estiba y otros servicios o insumos. Se registra cada movimiento. |
| Comercializador | Compra, coordina el embarque, registra los gastos, emite las remisiones, gestiona el CFDI y concilia cobros y pagos. |

### Negocios y permisos

Cada negocio se registra de forma independiente y queda pendiente de aprobación del superadministrador, incluido el negocio inicial. El superadministrador puede aprobar, suspender o reactivar negocios y consultar o corregir operaciones para soporte.

- **Superadministrador.** Puede agregar y dar de baja a los administradores de cada negocio y asignarles o revocarles los permisos correspondientes, incluido el permiso para gestionar encargados.
- **Administrador del negocio.** Gestiona los viajes de su negocio. Con el permiso asignado por el superadministrador, puede dar de alta y de baja a los encargados de ese negocio. La baja revoca el acceso al negocio y a sus viajes asignados, y conserva el historial de las operaciones que realizó la persona.
- **Encargado.** Captura gastos en los viajes asignados. También puede iniciar sesión, seleccionar un negocio al que pertenece y usar **Solicitar viaje** desde su panel, incluso cuando todavía no tiene viajes asignados.
- **Eliminación del negocio.** El superadministrador puede eliminar cualquier negocio y el administrador puede eliminar el negocio que administra. Antes de proceder, la aplicación muestra una advertencia que identifica el negocio, explica las consecuencias y solicita una confirmación explícita.

Los datos se aíslan por negocio. Las altas, bajas y cambios de permisos, así como la eliminación de negocios, dejan historial de actor, fecha, acción y motivo.

### Panel del administrador y página de empleados

Al abrir un negocio, el administrador ve las opciones **Viajes**, **Solicitudes de viaje** y **Empleados**. La pantalla abre sin un apartado seleccionado y muestra un apartado a la vez. En **Viajes**, el selector identifica cada viaje por folio y cliente y solo muestra el viaje elegido. **Registrar viaje** está en ese apartado. Desde una solicitud aprobada, **Ir al viaje aprobado** abre directamente el viaje correspondiente. El historial de actividad sigue disponible en el panel del negocio.

**Empleados** abre una página independiente. La tabla consulta las membresías activas del negocio en PostgreSQL y presenta 20 registros por página, ordenados por correo. Muestra el correo, el rol y, para los administradores, el permiso para gestionar encargados. Solo ofrece acciones autorizadas para cada fila.

- **Agregar empleado** abre un modal para vincular una cuenta registrada y confirmada. El superadministrador puede agregar administradores y encargados. El administrador del negocio con permiso de gestión puede agregar encargados.
- El icono de **Editar** abre un modal donde el superadministrador puede activar o revocar el permiso para gestionar encargados de un administrador. El correo y el rol se muestran como datos de referencia.
- El icono de **Eliminar** confirma la baja individual. **Eliminar seleccionados** permite dar de baja a varios empleados. La casilla de encabezado selecciona las filas elegibles de la página actual. La selección y su contador se conservan al pasar de página.
- El modal de baja identifica a las personas afectadas, pide un motivo y requiere confirmación. El superadministrador puede dar de baja a administradores y encargados. El administrador con permiso de gestión solo puede dar de baja a encargados del mismo negocio. La API valida todo el lote y aplica las bajas en una sola transacción. Si alguna baja no procede, el lote queda intacto. Cada baja revoca la membresía y las asignaciones de ese negocio y conserva la cuenta y el historial de operaciones.

### Registro de negocio con nombre existente

Antes de registrar un negocio, el sistema verifica si el nombre ya existe. La comparación ignora mayúsculas, minúsculas y espacios sobrantes. Si hay coincidencia, la aplicación avisa y pregunta cómo desea continuar. La persona puede **Cambiar el nombre** o **Volver**. Si ya tiene acceso al negocio existente, también puede elegir **Ir al negocio existente**. La coincidencia conserva lo capturado y no crea un segundo negocio ni concede acceso por sí sola. La API aplica esta regla también cuando dos personas intentan registrar el mismo nombre al mismo tiempo.

### Regreso al apartado o paso anterior

Cada apartado y cada paso de captura permite **Volver** con una flecha de retorno a la pantalla o al paso del que se llegó. En un formulario de varios pasos, regresar conserva lo capturado. Si volver implica salir de un formulario y perder datos sin guardar, la aplicación pide confirmación y permite permanecer en la pantalla para continuar. Volver no deshace operaciones ya guardadas.

### Solicitud de viaje por un encargado

1. El encargado selecciona **Solicitar viaje** en el encabezado del negocio, captura los datos de apertura y del vehículo, y envía la solicitud para revisión. Puede consultar sus propias solicitudes y su estado dentro del negocio.
2. La solicitud queda **Pendiente de aprobación**. En **Solicitudes de viaje**, el administrador del mismo negocio puede abrirla, revisar y editar sus datos de apertura antes de resolverla.
3. **Aprobar** guarda la versión revisada, crea un solo viaje y lo asigna al encargado en la misma transacción. El encargado ve los datos aprobados y el enlace al viaje en sus solicitudes.
4. **Devolver** requiere un motivo. El encargado ve el motivo y recibe la versión revisada como borrador editable. Al corregirla y reenviarla, la solicitud vuelve a **Pendiente de aprobación**.
5. **Cancelar solicitud** requiere motivo y confirmación. El encargado puede consultar el estado **Cancelada** y su motivo. La solicitud queda cerrada para edición, reenvío y aprobación.
6. El historial registra actor, fecha, acción, cambios en los datos y motivo cuando corresponda. Si otra persona actualizó la solicitud desde que se abrió la revisión, la API rechaza la acción y la aplicación pide recargar la versión vigente.

## 3. Flujo operativo completo

1. **Abrir el viaje.** El administrador puede abrirlo directamente o aprobar una solicitud de un encargado. Antes de abrir el expediente o capturar movimientos, el administrador registra los datos de apertura. Si el encargado solicita el viaje, captura estos mismos datos en la solicitud para que el administrador los revise antes de abrir el expediente. Identificar cliente, producto y variedad, fecha, kilos previstos y precio de venta pactado. Registrar como datos obligatorios el chofer, las placas, el tipo de vehículo y la cantidad de canastos. El campo **Tipo de vehículo** muestra una lista de selección única con las opciones **Torton**, **Rabón**, **Camioneta** y **Jaula**. La tara del vehículo se puede capturar en kg y puede quedar vacía. Registrar la tarifa del chofer y, cuando aplique, la tarifa de flete que pagará el cliente. Guardar las tarifas de este viaje aunque después cambien las del catálogo. El viaje puede llevar varias variedades y Sabormex pacta un solo precio de venta por tonelada para todo el viaje.

   En un viaje abierto con los datos de vehículo pendientes, el administrador del negocio o un encargado asignado puede registrar el chofer, las placas, el tipo, los canastos y la tara opcional. El administrador puede completar después los acuerdos comerciales que falten. Las placas identifican al vehículo dentro del negocio e impiden que se asigne a dos viajes abiertos a la vez. Una solicitud propone el vehículo y la aprobación confirma su disponibilidad.

2. **Planear la compra.** Capturar merma estimada, gastos previstos y meta mínima del 30% sobre ingresos. Para una carga de referencia de 20 t, diciembre tiene una merma observada de 100–300 kg (0.5%–1.5%) y mayo de 700–800 kg (3.5%–4%). Los rangos orientan la estimación por viaje. Conservar la estimación inicial y permitir simular precios alternativos de compra. Al confirmar **Guardar estimación**, mostrar los resultados del viaje, incluido el tope conservador total y por tonelada, con la reserva de ISR estimada sobre la venta de piña. **Modificar estimación** precarga los datos de la versión vigente y guarda una nueva versión al confirmar. El historial conserva las versiones anteriores y la distribución sugerida de la reserva sigue usando la estimación inicial.

3. **Comprar a productores.** Registrar los tickets de pesaje en finca. Cada ticket guarda folio, finca, productor, variedad, kilos, precio de compra por tonelada e importe. El precio puede variar entre tickets. Generar una sola remisión por proveedor y viaje, con un renglón por ticket y los totales de peso e importe, incluso si hay varias fincas. Las variedades iniciales son piña fresca Cayena, MD2, Champaca y Otra con descripción. Conservar el precio y la reserva pactados por compra. La reserva comercial se reparte entre todos los productores por kilos comprados, con o sin CFDI. Registrar los pagos y saldos por compra.

4. **Registrar gastos y adelantos.** Capturar cada pago de corte, estiba, canastos, escalera, agua, lonches, mandados y combustible para movimientos propios. Guardar fecha, concepto, importe, beneficiario y evidencia cuando exista. Los $8,000 típicos de adelanto al chofer se registran como abono al flete. El combustible del camión forma parte del flete. El combustible que el comercializador paga para sus mandados se registra como gasto propio. Los demás gastos se capturan como desembolsos realizados. El saldo de flete al chofer queda pendiente hasta su liquidación contra el ticket. Los encargados capturan desde su celular en viajes asignados. Si hay una falla de red u otro impedimento, reportan el gasto por mensaje o llamada y el administrador lo captura indicando el origen. Solo los gastos aprobados se suman al costo y al margen.

   La captura de gastos generales muestra importes independientes para Corte, Estiba, Canastos y Escalera. También admite un importe para un concepto opcional de la lista Flete, Pasaje, Mandados, Combustible propio, Agua, Lunch y Otros. Cada importe capturado queda como un gasto individual para revisión. El campo Beneficiario propone el correo del encargado asignado y permite editarlo. La captura por ticket de finca conserva el concepto, la tarifa y la relación con el ticket.

5. **Registrar el ticket de fábrica y emitir la remisión de entrega.** Al recibir el ticket, guardar el folio del comprobante de origen, la fecha y el peso neto mayor que cero. El apartado **Emitir remisión de entrega** aparece cuando los tres datos están completos y la API verifica el requisito al emitir. Precargar el cliente, el producto y el precio pactado desde el viaje. Proponer la fecha del ticket y usar su peso neto vigente como peso consignado al emitir.

   Cada negocio lleva su propia secuencia automática exclusiva de remisiones de entrega con formato `F-1`, `F-2`, `F-3` y siguientes. El sistema asigna el folio y guarda la remisión en la misma transacción. Una emisión fallida no consume folio y un reintento devuelve la remisión existente del viaje. Los tickets conservan el folio del comprobante original. Las correcciones posteriores del ticket quedan auditadas y la remisión emitida conserva sus datos y folio.

6. **Determinar la merma y liquidar al chofer.** La base del flete es el peso del ticket. Restar del flete total los anticipos y demás abonos para obtener el saldo. Contabilizar el flete completo una sola vez en el costo. Si un anticipo supera el cargo final, mostrar el excedente como ajuste o importe por recuperar. El ticket de fábrica registra solo el peso total recibido. El desglose por variedad se obtiene de los tickets de compra. La venta, el flete a fábrica y la merma usan el peso total recibido.

7. **Confirmar la venta con el correo de recepción.** Asociar cada renglón por cliente y remisión, guardar fecha de ingreso, entrada SAP, orden de compra, kilos netos e importe a facturar. El ticket y el correo deben confirmar **el mismo peso recibido**. Una discrepancia documental se aclara antes de confirmar el viaje. Una orden de compra o un correo puede agrupar varias entregas. Al confirmar el importe ya se puede mostrar el resultado económico con los costos registrados y señalar si hay gastos pendientes de captura. Usar la entrada SAP en el ámbito del cliente para detectar recepciones repetidas en reenvíos. El último PDF contiene solicitudes de febrero a mayo, incluida la remisión 46 repetida con la misma entrada SAP.

8. **Facturar el producto y conciliar el cobro.** Una factura timbrada puede agrupar varios viajes. Al emitirla por el portal del SAT u otro medio autorizado, guardar UUID, fecha, importe asignado a cada viaje y fecha de envío. En el ejemplo de Sabormex la solicitud indica recepción antes de las 12:00 para procesar el pago. Aplicar cada depósito, incluso si llega agrupado, a los viajes correspondientes. Conservar el saldo individual y los importes todavía sin aplicar.

9. **Solicitar y cobrar el flete acordado con el cliente.** Calcularlo con las toneladas recibidas y su tarifa pactada. Queda fuera de la factura del producto. Puede estar pendiente mientras se acumulan 5, 10, 15 u otro número de viajes. Al solicitarlo, seleccionar los viajes, relacionar el soporte de la solicitud y aplicar el depósito a esos saldos. El soporte operativo es una nota de remisión básica. El cobro se aplica al saldo de flete y se refleja en el total del viaje. El alcance del sistema para este flete es el historial operativo y el cuadre del viaje. Su documentación y tratamiento fiscal se revisan fuera del sistema.

10. **Consultar y cerrar.** Mostrar por viaje el plan y el resultado real, compras y gastos, flete pagado al chofer, saldo por cobrar de producto y saldo por cobrar de flete. El expediente recupera los datos guardados para ese viaje por cualquier persona autorizada que los haya capturado. Los encargados consultan únicamente los viajes asignados y los datos que su rol permite. Administración consulta el expediente completo de su negocio. La situación operativa, el resultado económico, la facturación y la cobranza deben poder avanzar en fechas distintas. El cierre operativo requiere entrega confirmada, flete al chofer calculado y aprobación administrativa de todos los gastos. La factura de piña y el flete por cobrar pueden seguir pendientes después del cierre. Solo el administrador puede agregar un gasto después del cierre, con fecha, importe y motivo. El importe aprobado actualiza el costo y el margen sin reabrir la operación.

### Cierre o reasignación del viaje

En **Cerrar operación**, el administrador elige **Cerrar** o **Reasignar como nueva solicitud**. **Cerrar** aplica las validaciones normales y deja el viaje **Cerrado**.

1. **Reasignar como nueva solicitud** requiere un motivo y un encargado activo del mismo negocio. Se precarga al responsable actual si sigue activo. El administrador puede elegir a otro encargado. Cuando hay varios encargados y ninguno está identificado como responsable, el administrador debe elegir uno.
2. El sistema marca el viaje original como **Reasignado**, bloquea nuevas capturas en su expediente y crea una solicitud vinculada en estado **Pendiente de corrección**, todo en la misma transacción. Esta opción está disponible aunque el viaje todavía no cumpla los requisitos del cierre normal. Un reintento devuelve la solicitud ya creada.
3. El encargado recibe los datos de apertura anteriores como borrador editable y puede modificarlos antes de reenviar la solicitud. El folio anterior se muestra como referencia y el nuevo viaje requiere un folio propio. Al aprobar se verifica la disponibilidad del vehículo. El viaje original deja de ocupar las placas al quedar **Reasignado**.
4. Los gastos, abonos, tickets y remisiones del viaje original se muestran como referencia de solo lectura según los permisos del usuario. Los comprobantes e importes se conservan en el viaje original. El nuevo viaje registra sus propios movimientos y los importes de referencia quedan fuera de sus cálculos.

### Aprobación y costos por ticket

Un ticket de finca puede respaldar corte, estiba, flete local, vaciado y pasaje. Para cada concepto cobrado por tonelada se guarda un solo gasto por ticket, con su beneficiario, peso, tarifa e importe. El gasto de estiba corresponde a un único estibador por ticket. Conservar el ticket adjunto como evidencia.

Mostrar el peso y la tarifa sugerida al capturar. Las tarifas pueden configurarse por viaje, finca o productor. Se propone usar ese orden cuando coincidan varias. El encargado puede ajustar el importe o la tarifa por un imprevisto y anotar el motivo. El administrador revisa, aprueba o devuelve la captura. Solo el administrador puede corregir gastos aprobados y aprobar modificaciones. Guardar importe anterior, nuevo, fecha, motivo y actor.

### Acuerdos y cancelación del viaje

Al cerrar el trato quedan fijos el precio pactado del viaje, el precio de compra y la reserva pactada con cada productor. Una oferta posterior de Sabormex, al alza o a la baja, no modifica esos acuerdos. Si se renegocia, cancelar el viaje y crear otro con sus propios acuerdos. El historial conserva el original y su vínculo con el nuevo.

En el flujo de cancelación por renegociación, el usuario decide por cada gasto o adelanto si queda como pérdida o se traslada al nuevo viaje. Registrar el origen y el destino. Un importe trasladado cuenta en el viaje nuevo y no genera pérdida en el cancelado. Los datos relevantes del viaje cancelado pueden pasar al nuevo como referencia para el nuevo acuerdo. La reasignación desde **Cerrar operación** se rige por el flujo de reasignación y conserva sus movimientos como referencia de solo lectura.

## 4. Reglas de cálculo y control

- **Peso previsto de recepción** = kilos previstos de compra × (1 − merma estimada). Guardar los pesos en kg y convertir a toneladas métricas para aplicar tarifas por tonelada.

- **Merma real** = kg comprados − kg recibidos. **Merma real porcentual** = merma real ÷ kg comprados. Si el peso recibido supera al comprado, conservar ambos y marcar la diferencia para revisión. La merma la absorbe el comercializador. El peso y precio pactados de compra determinan el pago al productor.

- **Ingreso estimado de producto** = toneladas previstas de recepción × precio de venta pactado. **Flete estimado del chofer** = esas toneladas × tarifa del chofer.

- **Tope de compra** = ingresos considerados × (1 − margen objetivo) − flete estimado del chofer − demás gastos previstos. **Tope por tonelada** = tope de compra ÷ toneladas que se planea comprar. Un tope negativo indica que el objetivo no es viable con esos supuestos.

- **Costo operativo** = compras + flete total del chofer + otros gastos aprobados. Los anticipos y pagos liquidan obligaciones. La merma reduce los kilos facturables y el ingreso; los kilos perdidos ya están reflejados en el costo total de compra.

- **Resultado de producto** = importe confirmado del producto − costo operativo. **Resultado incluyendo flete del cliente** = importe confirmado del producto + flete acordado por cobrar − costo operativo. Mostrar los márgenes sobre sus respectivas bases de ingreso. La meta del 30% para fijar el tope de compra incluye la venta del producto y el flete pactado por cobrar al cliente. La vista de producto por separado permite ver cuánto cambia el resultado mientras el flete sigue pendiente. Diferenciar importes confirmados, solicitados, facturados y cobrados.

- **Saldo** = importe exigible − pagos aplicados. Calcularlo por concepto y viaje. Si aún no existe ingreso positivo, mostrar el importe de ganancia o pérdida y dejar el porcentaje sin calcular. En la vista de margen, separar impuestos trasladados y considerar el tratamiento contable del IVA acreditable o no acreditable.

### Retención del 1.25% y precio máximo conservador

El comercializador es **persona física en RESICO**. Las facturas revisadas de venta de piña a Sabormex muestran **ISR retenido del 1.25% sobre la venta de piña** e IVA a tasa 0%. Guardar la base, la tasa y el importe real del comprobante. El flete pactado con Sabormex entra en la base del margen comercial del 30% y queda fuera del cálculo de esta reserva y de la factura de piña.

El **tope conservador por tonelada** se muestra por defecto para la última estimación. El historial muestra el tope conservador total y por tonelada de cada escenario. Es el tope comercial menos el 1.25% de la venta estimada de piña. Distribuir la reserva en proporción al peso comprado a cada productor, con o sin CFDI. La reserva es un ajuste comercial a la oferta y el ISR real de Sabormex se registra por separado. El CFDI de compra documenta la operación.

Ejemplo. Con $100,000 de venta estimada de piña, $17,000 de flete por cobrar, $20,000 de costos distintos de la compra y 20 t compradas, la meta del 30% es $35,100. El tope comercial es $61,900. La reserva es $1,250 y el tope conservador es $60,650 ($3,032.50/t). A un productor de 12 t le corresponden $750 de reserva y a uno de 8 t, $500.

### Aplicación de depósitos agrupados

Si una factura agrupa dos viajes por $60,000 y $40,000 y llega el pago completo conciliado, se aplica $60,000 al primero y $40,000 al segundo. Si el depósito es de $70,000 y el cliente no identifica qué viajes pagó, se registra el depósito y se deja pendiente de asignar hasta contar con su desglose o una regla de reparto aprobada. Si confirma que pagó el primer viaje completo y $10,000 del segundo, este último queda con $30,000 pendientes. Las retenciones respaldadas en el CFDI se concilian aparte para que su importe no aparezca como atraso del cliente. Producto y flete conservan saldos independientes. Sabormex normalmente paga contra factura entregada. El adelanto excepcional en efectivo se administra como un crédito separado.

### Adelanto excepcional de Sabormex

Registrar el efectivo recibido como crédito a favor del cliente, con fecha, importe, temporada de origen y saldo pendiente. Aplicarlo conforme a la indicación de Sabormex, al final o en parcialidades, a una o varias facturas de piña o a una remisión de flete. El saldo puede pasar a la siguiente temporada. Una devolución excepcional, total o parcial, reduce ese saldo y se registra con fecha, importe y referencia.

Si el flete agrupa varios viajes, registrar el descuento una sola vez en el encabezado de la remisión agrupada. Los viajes conservan sus importes de flete para el margen. Por ejemplo, una remisión de $40,000 con $10,000 de adelanto aplicado deja $30,000 por cobrar. El descuento reduce el saldo del adelanto y el cobro pendiente, sin modificar la rentabilidad.

## 5. Caso de validación con la segunda hoja del cuaderno

| Dato | Valor | Observación |
|---|---:|---|
| Compra | 21,730 kg × $6.70 = **$145,591** | Cuadra con el importe anotado. |
| Peso recibido y merma | **21,640 kg** y **90 kg (0.41%)** | Lectura del cuaderno. Falta empatar con el ticket y el correo del mismo viaje. |
| Flete del chofer | 21.640 t × $800 = **$17,312** | Tarifa inferida por el cálculo. Con $8,000 de anticipo quedan $9,312. |
| Corte | **$10,100** | Pendiente confirmar su desglose y otros gastos del viaje. |
| Costo identificado | **$173,003** | Compra, flete completo y corte. |
| Venta de producto | 21,640 kg × $7.30 = **$157,972** | Lectura provisional del cuaderno. |
| Flete por cobrar | 21.640 t × $850 = **$18,394** | Sujeto a confirmar que dicha tarifa aplicó a este viaje. |
| Resultado con flete por cobrar | **$3,363 (1.91%)** | Usando las cifras provisionales y los gastos identificados. Solo con la venta de producto: pérdida de $15,031. |

La segunda hoja del cuaderno es un ejercicio independiente de captura manual. No se dispone del correo ni de la factura de ese viaje. Los correos y CFDI de Sabormex son ejemplos separados del flujo documental.

### Caso documental de Sabormex

El correo agrupa las remisiones 42 y 43, por $168,714 y $153,582. El CFDI suma $322,296 por 41,320 kg, registra $4,028.70 de ISR retenido y arroja $318,267.30 netos por conciliar. El total del CFDI sirve para conciliar el depósito. El subtotal alimenta la rentabilidad y cada viaje conserva su importe.

## 6. Diseño técnico y base de datos propuesta

Una base relacional permite conservar los vínculos entre viajes, documentos y movimientos. La plataforma, el motor y el alojamiento quedan por decidir.

| Entidades propuestas | Relaciones y campos principales |
|---|---|
| `terceros`, `fincas`, `productos`, `vehiculos` | Roles de productor, cliente, transportista o prestador. Catálogos operativos y fiscales con acceso por rol. |
| `viajes`, `estimaciones_viaje` | Cliente, producto, fechas, tarifas pactadas, chofer, placas, tipo de vehículo, cantidad de canastos y tara opcional en kg. Historial de escenarios de peso, merma, gastos y margen. |
| `compras`, `remisiones_compra`, `remisiones_entrega` | Varias compras por viaje. Una remisión por proveedor y viaje, con renglones por ticket y una remisión de entrega por viaje con folio consecutivo único dentro del negocio. |
| `tickets_fabrica`, `consecutivos_remision_entrega` | Ticket de fábrica vinculado directamente al viaje. Un contador por negocio asigna el folio de entrega en la transacción de emisión. |
| `recepciones`, `comprobantes_recepcion` | Recepción vigente por viaje con peso confirmado. Evidencias de ticket y correo, fecha, SAP, orden de compra y monto. Conservar correcciones y una referencia al renglón de origen. |
| `gastos`, `fletes_chofer` | Costos individuales por viaje, beneficiario y evidencias. El flete conserva su tarifa, peso base e importe. |
| `cuentas_por_pagar`, `cuentas_por_cobrar` | Obligaciones ligadas a compras, gastos y flete del chofer. Derechos de cobro del cliente diferenciados por producto y flete. |
| `facturas`, `factura_viajes`, `solicitudes_flete`, `solicitud_flete_viajes` | Encabezados y líneas de asignación por viaje. Una factura o una solicitud puede agrupar varios viajes y conserva el importe asignado a cada uno. |
| `movimientos_pago`, `aplicaciones_pago` | Depósitos, anticipos y pagos con fecha, medio y referencia. Las aplicaciones relacionan cada movimiento con una o más cuentas abiertas. |
| `adjuntos`, `eventos_auditoria` | Archivos originales, responsable, fechas, historial de cambios y motivo de ajustes. |
| `adelantos_cliente`, `aplicaciones_adelanto`, `devoluciones_adelanto`, `traslados_gasto` | Crédito por cliente y temporada de origen. Aplicaciones a facturas de piña o al encabezado de una remisión de flete. Devoluciones, saldo y trazabilidad por gasto trasladado entre viajes. |
| `negocios`, `usuarios`, `membresias`, `asignaciones_viaje` | Registro independiente por negocio, estado de aprobación, roles y asignaciones. |
| `solicitudes_viaje` | Negocio, encargado solicitante, datos de apertura, estado, fechas, administrador revisor, motivo de devolución o cancelación, versión para controlar revisiones simultáneas, vínculo único con el viaje aprobado y vínculo único con el viaje original cuando proviene de una reasignación. |
| `tickets_finca`, `tarifas_gasto`, `revisiones_gasto` | Evidencia de pesaje en finca, tarifas por concepto y ámbito, aprobación y cambios auditados. Una combinación de ticket y concepto admite un gasto. |

**Integridad.** Usar decimales de precisión fija para pesos, tarifas e importes. Definir políticas de redondeo y almacenar moneda. Validar folios dentro de su ámbito y evitar duplicados de recepciones por referencias de origen. Guardar la asignación y actualizar el saldo en una misma transacción. Limitar los importes aplicados al monto disponible y registrar excedentes aparte. Conservar el historial al corregir pesos, tarifas, documentos y pagos.

**Servicios propuestos.** Separar captura y consulta de las reglas de cálculo, generación de remisiones y conciliación. Los documentos y cálculos deben salir del mismo dato autorizado. Adjuntar archivos con permisos y trazabilidad. Separar los permisos de captura, aprobación de ajustes, tesorería y revisión fiscal. Probar restauración de respaldos antes de depender del sistema para el cierre.

## 7. Módulo fiscal para México

Incorporarlo sobre las compras, los gastos, la facturación y los pagos. Una remisión documenta la operación comercial. El CFDI y la evidencia de pago respaldan su revisión fiscal. Para persona física en RESICO, el ISR se calcula sobre ingresos efectivamente cobrados sin IVA y sin deducciones. Los gastos siguen formando parte del margen comercial. El alcance fiscal específico del flete por cobrar queda fuera de este sistema.

| Componente | Qué incorporar |
|---|---|
| **CFDI de ingresos** | Importar XML timbrado de la venta emitida por el SAT o un PAC, identificar UUID, emisor, receptor, fecha, conceptos, subtotal, impuestos, total, método y forma de pago. Relacionar el CFDI con uno o varios viajes. Confirmar con el contador el documento fiscal aplicable al flete que cobra el comercializador y cuándo debe emitirse. |
| **CFDI de egresos, ajustes y cancelaciones** | Vincular notas de crédito, sustituciones, CFDI relacionados y estado de cancelación. Recalcular saldos por ajuste registrado, preservando los documentos originales y sus relaciones. |
| **CFDI recibidos y gastos deducibles** | Adjuntar XML y comprobante de pago a compra, flete o gasto. Revisar RFC, vigencia, concepto, requisitos del medio de pago y relación con la actividad. Clasificar como pendiente, elegible, parcial o no deducible con justificación. Un gasto sin CFDI sigue formando parte del costo operativo registrado. Revisar con el contador el esquema aplicable a compras a productores y los requisitos específicos de combustible. |
| **Pagos y complementos** | Conciliar depósitos con los CFDI y las asignaciones por viaje. Cuando corresponda por método de pago y reglas aplicables, vincular CFDI de recepción de pagos y saldos por documento. Registrar pagos parciales, agrupados y fechas efectivas. |
| **IVA** | Guardar por concepto objeto de impuesto, base, tasa, traslado, retención y monto acreditable. Distinguir tasa 0%, exento y fuera del objeto según corresponda. Configurar y validar por separado el tratamiento de la piña y del flete, así como el periodo de cobro o pago que corresponda. |
| **ISR** | Clasificar ingresos, deducciones, retenciones y diferencias fiscales por periodo, según régimen, tipo de contribuyente y reglas vigentes. Generar un concentrado conciliable para revisión contable. El margen comercial del 30% es un indicador de negocio. |
| **Traslado y Carta Porte** | Vincular remisión, vehículo, operador, ruta y prestador. Validar si procede el complemento Carta Porte y quién lo emite según el servicio y el trayecto. |
| **Validación y custodia** | Conservar XML original y PDF si existe. Controlar UUID duplicados, verificar estatus ante el SAT y restringir el acceso. Si se autoriza timbrado integrado después, proteger certificados y credenciales fuera de la base operativa y auditar cada emisión. |

**Primera entrega fiscal propuesta.** Carga de XML, vinculación por viaje o gasto, revisión contable y exportación de conciliaciones. El timbrado integrado, la consulta automatizada de estatus y los reportes fiscales avanzados pueden incorporarse después de validar el régimen y el flujo real de facturación. Revisar los requisitos y catálogos vigentes antes de configurar reglas fiscales.

Referencias oficiales para esa etapa: [SAT](https://www.sat.gob.mx/), [Código Fiscal de la Federación](https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf), [Ley del IVA](https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf), [Ley del ISR](https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf).

## 8. Módulos y criterios de aceptación

| Módulo | Prueba de aceptación |
|---|---|
| Negocios, roles y viajes asignados | Un negocio pendiente requiere aprobación. El superadministrador puede agregar o dar de baja administradores y gestionar sus permisos por negocio. Un administrador con el permiso correspondiente puede agregar o dar de baja encargados de su negocio. La baja revoca el acceso y conserva el historial. Los encargados consultan sus propias solicitudes y los viajes asignados. Un encargado sin viajes asignados puede enviar una solicitud. El administrador del mismo negocio la aprueba y el viaje resultante se asigna al solicitante. Tanto el superadministrador como el administrador del negocio pueden eliminarlo después de ver una advertencia y confirmar la acción. Dos negocios conservan sus datos separados. |
| Catálogos, viajes y estimación | Dos viajes con el mismo cliente conservan tarifas propias. Al variar la merma prevista se recalcula el precio máximo de compra. |
| Compras y remisiones | Dos tickets del mismo proveedor generan una remisión con dos renglones en el viaje. La remisión de entrega lleva el precio del cliente. |
| Gastos y flete del chofer | Un flete de $20,000 con $8,000 adelantados muestra $12,000 por pagar y aporta $20,000 al costo. El combustible de un mandado queda como gasto adicional. |
| Recepción y rentabilidad | El mismo peso recibido alimenta la venta y el flete. Una discrepancia de documentos queda pendiente. El margen puede consultarse antes del depósito. |
| Facturación y cobro de producto | Una factura cubre dos viajes. Un depósito parcial o agrupado se aplica con importes identificables y deja los saldos correctos. |
| Flete por cobrar al cliente | A $850/t, una entrega de 20 t genera $17,000 de saldo de flete. Se pueden agrupar viajes en una solicitud y liquidarlos conservando sus saldos individuales. |
| Expediente fiscal | Se importa un XML una sola vez, se vincula con las operaciones correspondientes y se conserva el historial de ajustes y revisión. |

### Criterios de aceptación para el panel y la emisión de remisiones

- Al entrar como administrador se ven los accesos **Viajes**, **Solicitudes de viaje** y **Empleados**. Al seleccionar otro viaje se sustituye el anterior. El enlace de una solicitud aprobada abre su viaje. Cancelar el regreso conserva el borrador.
- Con más de 20 empleados, la tabla pagina desde la base y conserva la selección entre páginas. Los modales permiten agregar una cuenta, editar el permiso y confirmar bajas. Un usuario de otro negocio queda excluido. Una baja múltiple con una fila no autorizada conserva todas las membresías y asignaciones.
- Guardar la primera estimación muestra los resultados del viaje. Modificarla precarga la última versión, muestra los resultados recalculados al guardar y conserva las versiones anteriores. El expediente recupera las capturas previas de otras personas autorizadas según los permisos del lector.
- Un ticket de fábrica incompleto oculta el apartado de emisión y la API rechaza la solicitud. Un ticket completo permite precargar la fecha y el peso neto junto con los datos pactados. Dos emisiones simultáneas del mismo negocio reciben folios distintos y consecutivos. Los negocios llevan secuencias independientes y los fallos y reintentos no consumen folios adicionales.

### Criterios de aceptación para solicitudes y reasignación

- La edición administrativa se refleja en los datos que consulta el encargado después de aprobar o devolver la solicitud. La devolución muestra el motivo y permite corregir y reenviar. La cancelación muestra el motivo y bloquea nuevas acciones sobre la solicitud.
- Un usuario de otro negocio queda excluido. Una revisión desactualizada exige recargar. Dos aprobaciones simultáneas crean un solo viaje asignado al encargado.
- El cierre normal exige completar las validaciones de recepción y gastos. La reasignación de un viaje que aún no cumple esas validaciones marca el original como **Reasignado**, bloquea nuevas capturas y genera una sola solicitud **Pendiente de corrección**, incluso si se reintenta la acción.
- La reasignación propone al responsable activo y permite elegir a otro encargado del negocio. El encargado edita los datos de apertura precargados sin afectar el expediente original. Al aprobar la solicitud se crea un viaje con folio propio y sin duplicar gastos, abonos ni comprobantes.

### Pruebas de las reglas validadas

- Al registrar un nombre que ya existe con distintas mayúsculas o espacios sobrantes, la aplicación muestra las opciones para continuar sin duplicar el negocio. Solo una persona con acceso puede abrir el negocio existente desde ese aviso.
- En un flujo de varios pasos, **Volver** recupera la pantalla previa y conserva la captura. Si salir descarta datos sin guardar, la persona puede cancelar la salida y seguir editando.

- Un viaje con dos productores reparte $1,250 de reserva en $750 y $500 para compras de 12 t y 8 t, con independencia del CFDI. Una merma de 500 kg reduce la venta y conserva el peso comprado.

- Un viaje cancelado registra el corte como pérdida y traslada el adelanto al nuevo viaje. Cada importe cuenta una vez.

- Un adelanto de cliente conserva saldo entre temporadas, admite devolución y se aplica a una remisión agrupada de flete sin prorratear el descuento entre viajes.

- Dos negocios aprobados conservan datos separados. El superadministrador puede intervenir para dar soporte y su acción queda auditada.

- Dos tickets de un proveedor registran variedades y precios distintos dentro de una remisión. El mismo ticket admite una estiba y un corte. Una segunda estiba para ese ticket se rechaza.

- Tanto en el alta directa por administración como en la solicitud de un encargado se requieren chofer, placas, tipo de vehículo y cantidad de canastos antes de abrir el expediente o capturar movimientos. Se debe elegir un tipo de vehículo de la lista: Torton, Rabón, Camioneta o Jaula. La tara puede quedar vacía y, si se captura, se conserva en kg.

- Un encargado sin viajes asignados captura y envía una solicitud. El administrador de otro negocio queda excluido de la revisión. El administrador del mismo negocio devuelve la solicitud con motivo, el encargado la corrige y, al aprobarla, se crea un solo viaje asignado al solicitante.

- El gasto pendiente se excluye del margen y bloquea el cierre operativo. Tras cerrar con cobros pendientes, un administrador puede agregar un gasto motivado y registrar cobros sin reabrir la operación.

### Pendientes antes de ampliar el alcance

1. Confirmar los datos y formatos para la captura inicial y la conciliación fiscal de la venta de piña.

2. Revisar con el contador, fuera del sistema, la documentación y el tratamiento fiscal del flete por cobrar.

3. Mantener el ejemplo del cuaderno como caso independiente y usar los comprobantes de Sabormex para validar el flujo de recepción, facturación y cobro.

4. Definir el alcance operativo y las pantallas de la primera versión.

5. Validar en el Mac el primer bloque local antes de ampliar la aplicación o publicar.

### Mejora futura

Incorporar la exportación de datos o reportes por negocio, incluida la posibilidad de exportar antes de confirmar su eliminación.

## 9. Arquitectura aprobada y ejecución local

| Capa | Decisión |
|---|---|
| Web | Next.js y TypeScript. Interfaz adaptable a celular y computadora. Captura datos y presenta resultados, estados y permisos informados por la API. |
| Backend | NestJS y TypeScript como aplicación independiente. API REST con contrato OpenAPI. Abarca validación de permisos, reglas de compra, gastos, cálculo de margen, cierre, pagos y auditoría conforme se implementan los módulos. |
| Datos | Supabase PostgreSQL con migraciones versionadas. El backend controla el acceso por negocio y la base de datos protege la integridad de las relaciones. |
| Identidad y documentos | Supabase Auth para inicio de sesión y Supabase Storage privado previsto para tickets, facturas y comprobantes. |
| Desarrollo en Mac | Node.js 22 o posterior, npm y Docker Desktop. Supabase CLI inicia los servicios locales. La web está en `http://localhost:3000` y OpenAPI en `http://localhost:3001/docs`. |
| Publicación posterior | Vercel para la web, Railway para la API y Supabase en la nube. Pruebas y producción tendrán bases, usuarios y archivos separados. |

**Límite entre la web y el backend.** La web valida formatos para ayudar a capturar. La API determina si una operación procede, calcula importes y aplica las reglas. Una futura app móvil podrá utilizar el mismo contrato sin reimplementar la lógica. La primera versión usa conexión a internet; si el encargado no tiene acceso, reporta el gasto por mensaje o llamada y lo captura el administrador.

### Migración del flujo de remisiones

Usar una migración nueva que vincule el ticket de fábrica directamente al viaje y preserve los tickets y las remisiones existentes. Inicializar el contador de cada negocio después del mayor folio histórico con formato `F-n`. Si el negocio carece de folios con ese formato, iniciar en `F-1`. Conservar los folios ya emitidos, incluidos los que usan otro formato.

### Migración de solicitudes y reasignaciones

Usar una migración nueva para incorporar el estado **Reasignado** en viajes y los estados **Pendiente de corrección** y **Cancelada** en solicitudes. Registrar el vínculo de origen y proteger su unicidad para impedir dos solicitudes de reasignación del mismo viaje. Conservar las solicitudes, asignaciones e historiales existentes. Verificar los permisos y las transiciones con cuentas de demostración en Supabase local.

### Prueba en el Mac

Después de descomprimir el paquete y abrir Docker Desktop, ejecuta en la raíz del repositorio:

```bash
npm ci
npm run db:start
npm run db:configure
npm run demo
npm run dev
```

El README contiene las cuentas de demostración. El primer bloque reconstruido compiló correctamente en Linux. Su arranque con la instalación completa de Supabase CLI y Docker en el Mac sigue pendiente de verificación. Los siguientes módulos funcionales cubren tickets de finca, aprobación de gastos y el cálculo de costo por viaje.
