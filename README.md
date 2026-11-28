# ponitero

Aplicación local de control de viajes de piña. Incluye registro y aprobación de negocios, roles, alta y asignación de viajes e historial. Las reglas de acceso viven en NestJS. Next.js consume la API. PostgreSQL, Auth y Storage se ejecutan con Supabase local.

## Arrancar en Mac

Abre Docker Desktop. Instala Node.js 22 o posterior con npm. Desde esta carpeta ejecuta:

```bash
npm ci
npm run db:start
npm run db:configure
npm run demo
npm run dev
```

Para aplicar migraciones nuevas a una instancia local que ya está en ejecución, usa `npm exec -- supabase migration up --local` desde la raíz.

Abre http://localhost:3000. La documentación de la API está en http://localhost:3001/docs. El comando de configuración crea `api/.env` una sola vez. Si el archivo ya existe y corresponde a tu instalación, continúa con el siguiente paso.

La configuración de Supabase usa el identificador local `ponitero`. Si abriste la versión anterior, sus registros siguen en la instancia identificada como `campo-costos`. Para usar ambos proyectos con los mismos puertos, detén la instancia anterior antes de iniciar la nueva.

## Cuentas de ejemplo

Todas usan la contraseña `CampoDemo2026!` y se crean solo en la base local.

| Cuenta | Acceso |
|---|---|
| `super@campo.test` | Administrar estados y consultar ambos negocios |
| `admin.a@campo.test` | Administrar Piñas del Sur |
| `encargado.a@campo.test` | Consultar el viaje DEMO-A-1 |
| `admin.b@campo.test` | Administrar Fruta de la Costa |
| `encargado.b@campo.test` | Consultar el viaje DEMO-B-1 |

Para probar el alta, registra un usuario nuevo y crea un negocio. Entra como superadministrador, aprueba el registro y habilita al administrador para gestionar encargados. Vuelve a entrar como administrador y agrega una cuenta registrada como encargado. Desde esa cuenta, selecciona el negocio y solicita un viaje. Entra como administrador para revisar y aprobar la solicitud. El viaje aparecerá entre las asignaciones del encargado.

## Expediente del viaje

Entra como administrador, registra un viaje con sus acuerdos de apertura y abre el expediente para guardar una estimación. Si un viaje anterior aún requiere datos, usa **Completar apertura**. Captura los tickets de finca, registra la remisión de entrega y compara el peso del ticket de fábrica con el peso del correo. Un encargado asignado puede capturar gastos. Administración revisa esos gastos, registra abonos al chofer y cierra la operación cuando los pesos coinciden y los gastos están aprobados.

Los importes se registran en MXN. Las tarifas se capturan por tonelada métrica y los pesos en kg. PostgreSQL calcula los importes con valores decimales y redondea los cargos a centavos. La distribución sugerida de la reserva usa la primera estimación y los kilos comprados a cada productor. La captura de tickets conserva la reserva pactada correspondiente a cada compra.

En **Planear la compra** puedes comparar ofertas por utilidad y margen estimados después de la reserva. En el expediente, Administración puede configurar tarifas sugeridas de gasto por viaje, finca o productor. Desde el menú del negocio, **Exportar viajes** descarga sus expedientes en JSON.

Consulta los apartados pendientes en el [estado de implementación](docs/estado-implementacion.md).

## Documentación

Consulta el [índice de documentación](docs/README.md) y las [instrucciones para agentes](AGENTS.md).
