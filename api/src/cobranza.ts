import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type postgres from 'postgres';
import { z } from 'zod';

type Sql = postgres.TransactionSql;
const texto = z.string().trim().min(1).max(200);
const moneda = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const positivo = moneda.refine(value => Number(value) > 0);
const concepto = z.enum(['producto', 'flete']);

export const cobro = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('documento'), concepto, referencia: texto, fecha: z.iso.date(),
    fechaEnvio: z.iso.date(), lineas: z.array(z.object({ viaje: z.uuid(), retencion: moneda.optional() })).min(1).max(100) }),
  z.object({ accion: z.literal('fondo'), tipo: z.enum(['deposito','adelanto']), cliente: texto,
    referencia: texto, fecha: z.iso.date(), temporada: texto.optional(), importe: positivo }),
  z.object({ accion: z.literal('aplicar'), fondo: z.uuid(), documento: z.uuid(),
    fecha: z.iso.date(), referencia: texto,
    partidas: z.array(z.object({ viaje: z.uuid().optional(), importe: positivo })).min(1).max(100) }),
  z.object({ accion: z.literal('devolver'), fondo: z.uuid(), fecha: z.iso.date(), referencia: texto, importe: positivo }),
]);

export async function estadoCobranza(sql: Sql, negocio: string) {
  const viajes = await sql`
    select t.id,t.reference,t.customer,r.venta producto,
      round(f.kg*(t.acuerdos->>'fleteCliente')::numeric/1000,2) flete,
      p.documento factura, p.saldo saldo_producto, l.documento remision, l.saldo saldo_flete
    from campo.trips t
    left join campo.recepciones r on r.viaje=t.id
    left join campo.tickets_fabrica f on f.viaje=t.id
    left join campo.saldos_linea_cobro p on p.viaje=t.id and p.concepto='producto'
    left join campo.saldos_linea_cobro l on l.viaje=t.id and l.concepto='flete'
    where t.business_id=${negocio}
      and ((t.reasignado_en is null and r.kg_correo=f.kg) or p.documento is not null or l.documento is not null)
    order by t.created_at,t.id`;
  const documentos = await sql`
    select d.*,coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object(
      'importe',l.importe::text,'saldo',l.saldo::text,'retencion',l.retencion::text,'aplicado',l.aplicado::text,
      'referencia',t.reference) order by t.created_at,t.id)
      from campo.saldos_linea_cobro l join campo.trips t on t.id=l.viaje where l.documento=d.id),'[]') lineas
    from campo.saldos_documento_cobro d where d.negocio=${negocio} order by d.fecha desc,d.id`;
  const fondos = await sql`select * from campo.saldos_fondo_cliente where negocio=${negocio} order by fecha desc,id`;
  const movimientos = await sql`select * from campo.movimientos_cobro where negocio=${negocio} order by fecha desc,id`;
  return { viajes, documentos, fondos, movimientos };
}

// El controlador bloquea el negocio durante toda la mutación para serializar
// asignaciones, devoluciones y cambios en los viajes usados como origen.
export async function registrarCobro(sql: Sql, negocio: string, datos: z.infer<typeof cobro>) {
  if (datos.accion === 'documento') {
    const referencia = datos.concepto === 'producto'
      ? z.uuid().safeParse(datos.referencia.toLowerCase()) : { success: true as const, data: datos.referencia };
    if (!referencia.success) throw new BadRequestException('Indica el UUID de la factura timbrada.');
    if (datos.fechaEnvio < datos.fecha) throw new BadRequestException('El envío debe ser en la fecha de emisión o después.');
    const ids = datos.lineas.map(item => item.viaje);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Selecciona cada viaje una sola vez.');
    const viajes = await sql`
      select t.id,t.customer,r.venta producto,round(f.kg*(t.acuerdos->>'fleteCliente')::numeric/1000,2) flete
      from campo.trips t join campo.recepciones r on r.viaje=t.id
      join campo.tickets_fabrica f on f.viaje=t.id and f.kg=r.kg_correo
      where t.business_id=${negocio} and t.reasignado_en is null and t.id=any(${ids}::uuid[])`;
    if (viajes.length !== ids.length || new Set(viajes.map(v => v.customer)).size !== 1) {
      throw new BadRequestException('Selecciona viajes del mismo cliente con recepción confirmada.');
    }
    const [documento] = await sql`insert into campo.documentos_cobro(negocio,cliente,concepto,referencia,fecha,fecha_envio)
      values (${negocio},${viajes[0].customer},${datos.concepto},${referencia.data},${datos.fecha},${datos.fechaEnvio}) returning id`;
    for (const linea of datos.lineas) {
      const viaje = viajes.find(v => v.id === linea.viaje)!;
      const importe: string | null = viaje[datos.concepto];
      const retencion = linea.retencion ?? '0';
      if (!importe || Number(importe) <= 0 || Number(retencion) > Number(importe) ||
          (datos.concepto === 'flete' && Number(retencion) !== 0)) {
        throw new BadRequestException('Verifica el importe exigible y la retención del viaje.');
      }
      await sql`insert into campo.lineas_cobro(negocio,cliente,documento,concepto,viaje,importe,retencion)
        values (${negocio},${viaje.customer},${documento.id},${datos.concepto},${viaje.id},${importe},${retencion})`;
    }
    return { id: documento.id };
  }
  if (datos.accion === 'fondo') {
    if (datos.tipo === 'adelanto' && !datos.temporada) throw new BadRequestException('Indica la temporada de origen.');
    const [fondo] = await sql`insert into campo.fondos_cliente(negocio,cliente,tipo,referencia,fecha,temporada,importe)
      values (${negocio},${datos.cliente},${datos.tipo},${datos.referencia},${datos.fecha},
        ${datos.tipo === 'adelanto' ? datos.temporada! : null},${datos.importe}) returning id`;
    return { id: fondo.id };
  }
  const [fondo] = await sql`select *, fecha::text fecha_ingreso from campo.saldos_fondo_cliente where negocio=${negocio} and id=${datos.fondo}`;
  if (!fondo) throw new NotFoundException('Movimiento del cliente no encontrado.');
  if (datos.fecha < fondo.fecha_ingreso) throw new BadRequestException('La fecha es anterior al ingreso del dinero.');
  if (datos.accion === 'devolver') {
    if (fondo.tipo !== 'adelanto') throw new BadRequestException('Selecciona un adelanto del cliente.');
    const [movimiento] = await sql`insert into campo.movimientos_cobro(negocio,fondo,importe,fecha,referencia)
      select ${negocio},${fondo.id},${datos.importe},${datos.fecha},${datos.referencia}
      where ${datos.importe}::numeric<=${fondo.saldo}::numeric returning id`;
    if (!movimiento) throw new ConflictException('La devolución supera el saldo del adelanto.');
    return { id: movimiento.id };
  }
  const [documento] = await sql`select *, fecha::text fecha_documento from campo.saldos_documento_cobro
    where negocio=${negocio} and id=${datos.documento} and cliente=${fondo.cliente}`;
  if (!documento) throw new NotFoundException('Documento del cliente no encontrado.');
  if (datos.fecha < documento.fecha_documento) throw new BadRequestException('La aplicación es anterior a la emisión del documento.');
  const encabezado = fondo.tipo === 'adelanto' && documento.concepto === 'flete';
  const destinos = datos.partidas.map(p => p.viaje ?? null);
  if (new Set(destinos).size !== destinos.length || destinos.some(v => (v === null) !== encabezado)) {
    throw new BadRequestException(encabezado
      ? 'Aplica el adelanto una sola vez al encabezado de la remisión de flete.'
      : 'Asigna un importe por viaje del documento.');
  }
  const [validacion] = await sql`
    with partidas as (
      select * from jsonb_to_recordset(${sql.json(datos.partidas)}::jsonb) p(viaje uuid, importe numeric)
    )
    select coalesce(sum(p.importe),0)<=least(${fondo.saldo}::numeric,${documento.saldo}::numeric) total,
      bool_and(p.viaje is null or (l.viaje is not null and p.importe<=l.saldo)) lineas
    from partidas p left join campo.saldos_linea_cobro l on l.documento=${documento.id} and l.viaje=p.viaje`;
  if (!validacion.total || !validacion.lineas) throw new ConflictException('La aplicación supera el saldo disponible o el saldo del documento o viaje.');
  const movimientos = await sql`insert into campo.movimientos_cobro(negocio,fondo,documento,viaje,importe,fecha,referencia)
    select ${negocio},${fondo.id},${documento.id},p.viaje,p.importe,${datos.fecha},
      ${datos.referencia} || case when p.viaje is null then '' else ':' || p.viaje::text end
    from jsonb_to_recordset(${sql.json(datos.partidas)}::jsonb) p(viaje uuid, importe numeric)
    returning id`;
  return { movimientos: movimientos.map(item => item.id) };
}
