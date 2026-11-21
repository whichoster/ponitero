import { BadRequestException, ConflictException } from '@nestjs/common';
import type postgres from 'postgres';
import { z } from 'zod';

type Sql = postgres.TransactionSql;
const texto = z.string().trim().min(1).max(200);
const decimal = (escala: number) => z.string().trim().regex(
  new RegExp('^\\d{1,9}(\\.\\d{1,' + escala + '})?$'),
);
const dinero = decimal(2);
const peso = decimal(3).refine(value => Number(value) > 0);
const tarifa = decimal(4);

export const operacion = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('acuerdos'), fecha: z.iso.date(), producto: texto,
    chofer: texto, vehiculo: texto, placas: texto, venta: tarifa, fleteChofer: tarifa, fleteCliente: tarifa }),
  z.object({ accion: z.literal('plan'), kg: peso, merma: decimal(4).refine(x => Number(x) <= 100), gastos: dinero, oferta: tarifa.optional() }),
  z.object({ accion: z.literal('compra'), folio: texto, finca: texto, productor: texto,
    variedad: z.enum(['Cayena','MD2','Champaca','Otra']), descripcion: texto.optional(),
    kg: peso, tarifa, reserva: dinero }),
  z.object({ accion: z.literal('gasto'), ticket: z.uuid().optional(), concepto: texto,
    fecha: z.iso.date(), beneficiario: texto, tarifa: tarifa.optional(), importe: dinero,
    origen: z.enum(['directo','mensaje','llamada']), motivo: texto.optional() }),
  z.object({ accion: z.literal('revision'), gasto: z.uuid(), estado: z.enum(['aprobado','devuelto']),
    importe: dinero, motivo: texto }),
  z.object({ accion: z.literal('entrega'), folio: texto, fecha: z.iso.date(), kg: peso }),
  z.object({ accion: z.literal('ticketFabrica'), folio: texto, fecha: z.iso.date(), kg: peso, motivo: texto.optional() }),
  z.object({ accion: z.literal('recepcion'), folio: texto, sap: texto, orden: texto,
    fecha: z.iso.date(), kgCorreo: peso, venta: dinero, motivo: texto.optional() }),
  z.object({ accion: z.literal('abono'), fecha: z.iso.date(), importe: dinero.refine(x => Number(x) > 0), referencia: texto }),
  z.object({ accion: z.literal('cierre'), motivo: texto }),
]);

export async function expediente(sql: Sql, viaje: string) {
  const [resumen] = await sql`
    with base as (
      select t.acuerdos, t.cerrado_en, f.kg kg_ticket, r.kg_correo, r.venta,
        coalesce(c.kg,0) kg_comprados, coalesce(c.importe,0) costo_compra,
        coalesce(g.total,0) gastos_aprobados, coalesce(g.pendientes,0) gastos_pendientes,
        coalesce(a.total,0) abonos_chofer
      from campo.trips t
      left join campo.recepciones r on r.viaje=t.id
      left join campo.tickets_fabrica f on f.viaje=t.id
      cross join lateral (select sum(kg) kg,sum(importe) importe from campo.compras where viaje=t.id) c
      cross join lateral (select sum(importe) filter(where estado='aprobado') total,
        count(*) filter(where estado<>'aprobado') pendientes from campo.gastos where viaje=t.id) g
      cross join lateral (select sum(importe) total from campo.abonos_chofer where viaje=t.id) a
      where t.id=${viaje}
    ), calculo as (
      select *, round(kg_ticket * (acuerdos->>'fleteChofer')::numeric / 1000,2) flete_chofer,
        round(kg_ticket * (acuerdos->>'fleteCliente')::numeric / 1000,2) flete_cliente,
        case when kg_ticket=kg_correo then venta end venta_confirmada,
        kg_comprados-kg_ticket merma_kg
      from base
    ), resultado as (
      select *, costo_compra + gastos_aprobados + coalesce(flete_chofer,0) costo,
        round(100 * merma_kg / nullif(kg_comprados,0),2) merma_pct,
        flete_chofer-abonos_chofer saldo_chofer
      from calculo
    )
    select *, venta_confirmada-costo resultado_producto,
      venta_confirmada+flete_cliente-costo resultado_total,
      case when venta_confirmada>0 then round(100*(venta_confirmada-costo)/venta_confirmada,2) end margen_producto,
      case when venta_confirmada+flete_cliente>0 then
        round(100*(venta_confirmada+flete_cliente-costo)/(venta_confirmada+flete_cliente),2) end margen_total
    from resultado`;
  const planes = await sql`
    with previsiones as (
      select p.*, kg*(1-merma/100) kg_recibidos, t.acuerdos
      from campo.planes p join campo.trips t on t.id=p.viaje where viaje=${viaje}
    ), importes as (
      select *, kg_recibidos*(acuerdos->>'venta')::numeric/1000 venta,
        kg_recibidos*(acuerdos->>'fleteCliente')::numeric/1000 flete_cliente,
        kg_recibidos*(acuerdos->>'fleteChofer')::numeric/1000 flete_chofer
      from previsiones
    ), topes as (
      select *, (venta+flete_cliente)*0.70-flete_chofer-gastos tope,
        round(venta*0.0125,2) reserva from importes
    )
    select id, creado_en, kg, merma, gastos, oferta,
      round(venta+flete_cliente-flete_chofer-gastos-oferta*kg/1000,2) resultado_simulado,
      round(100*(venta+flete_cliente-flete_chofer-gastos-oferta*kg/1000)/nullif(venta+flete_cliente,0),2) margen_simulado,
      round(kg_recibidos,3) kg_recibidos,
      round(venta,2) venta, round(tope,2) tope_comercial, reserva,
      round(tope-reserva,2) tope_conservador, round((tope-reserva)*1000/kg,2) tope_por_tonelada
    from topes order by id`;
  const compras = await sql`select * from campo.compras where viaje=${viaje} order by productor,finca,folio`;
  const remisiones = await sql`with proveedores as (
      select productor,sum(kg) kg,sum(importe) importe,sum(reserva) reserva
      from campo.compras where viaje=${viaje} group by productor
    ), pesos as (
      select *, sum(kg) over(order by productor) acumulado, sum(kg) over() total from proveedores
    )
    select *, round(${planes[0]?.reserva ?? '0'}::numeric*acumulado/total,2)
      - round(${planes[0]?.reserva ?? '0'}::numeric*(acumulado-kg)/total,2) reserva_sugerida
    from pesos order by productor`;
  const gastos = await sql`select * from campo.gastos where viaje=${viaje} order by fecha,id`;
  const abonos = await sql`select * from campo.abonos_chofer where viaje=${viaje} order by fecha,id`;
  const [recepcion] = await sql`select * from campo.recepciones where viaje=${viaje}`;
  const [entrega] = await sql`select * from campo.remisiones_entrega where viaje=${viaje}`;
  const [ticketFabrica] = await sql`select * from campo.tickets_fabrica where viaje=${viaje}`;
  return { resumen, planes, compras, remisiones, gastos, abonos, recepcion, entrega, ticketFabrica };
}

export async function registrarOperacion(
  sql: Sql, viaje: string, negocio: string, datos: z.infer<typeof operacion>, rol: string,
) {
  const [actual] = await sql`select customer,acuerdos,cerrado_en from campo.trips where id=${viaje} for update`;
  if (actual.cerrado_en && !['gasto','revision','abono'].includes(datos.accion)) {
    throw new ConflictException('El viaje ya está cerrado.');
  }
  if (datos.accion !== 'acuerdos' && !actual.acuerdos) {
    throw new ConflictException('Registra los acuerdos del viaje primero.');
  }
  switch (datos.accion) {
    case 'acuerdos':
      if (actual.acuerdos) throw new ConflictException('Los acuerdos de este viaje ya quedaron fijos.');
      await sql`update campo.trips set acuerdos=${sql.json(datos)} where id=${viaje}`;
      break;
    case 'plan':
      await sql`insert into campo.planes(viaje,kg,merma,gastos,oferta)
        values(${viaje},${datos.kg},${datos.merma},${datos.gastos},${datos.oferta ?? null})`;
      break;
    case 'compra':
      if (datos.variedad === 'Otra' && !datos.descripcion) throw new BadRequestException('Describe la variedad.');
      await sql`insert into campo.compras(viaje,folio,finca,productor,variedad,kg,tarifa,reserva)
        values(${viaje},${datos.folio},${datos.finca},${datos.productor},
        ${datos.descripcion && datos.variedad === 'Otra' ? datos.descripcion : datos.variedad},
        ${datos.kg},${datos.tarifa},${datos.reserva})`;
      break;
    case 'gasto': {
      const concepto = datos.concepto.toLocaleLowerCase('es-MX');
      if (concepto === 'combustible del camión') throw new BadRequestException('Registra ese pago como abono al flete.');
      if (actual.cerrado_en && (!datos.motivo || rol === 'encargado')) {
        throw new ConflictException('Un gasto posterior al cierre requiere captura administrativa y motivo.');
      }
      if (rol === 'encargado' && datos.origen !== 'directo') throw new BadRequestException('El origen reportado se captura por administración.');
      if (datos.ticket) {
        const [ticket] = await sql`select id from campo.compras where viaje=${viaje} and id=${datos.ticket}`;
        if (!ticket || !datos.tarifa || !['corte','estiba','flete local','vaciado','pasaje'].includes(concepto)) {
          throw new BadRequestException('Verifica el ticket, el concepto y la tarifa por tonelada.');
        }
        const [importe] = await sql`select round(kg*${datos.tarifa}::numeric/1000,2)=${datos.importe}::numeric coincide
          from campo.compras where id=${ticket.id}`;
        if (!importe.coincide && !datos.motivo) throw new BadRequestException('Indica el motivo del ajuste de importe.');
      }
      await sql`insert into campo.gastos(viaje,ticket,concepto,fecha,beneficiario,tarifa,importe,origen,motivo)
        values(${viaje},${datos.ticket ?? null},${concepto},${datos.fecha},${datos.beneficiario},
        ${datos.tarifa ?? null},${datos.importe},${datos.origen},${datos.motivo ?? null})`;
      break;
    }
    case 'revision': {
      const [previo] = await sql`select estado,importe from campo.gastos where viaje=${viaje} and id=${datos.gasto}`;
      if (!previo) throw new BadRequestException('Gasto no encontrado.');
      await sql`update campo.gastos set estado=${datos.estado},importe=${datos.importe} where id=${datos.gasto}`;
      return { previo, nuevo: datos };
    }
    case 'entrega':
      await sql`insert into campo.remisiones_entrega(viaje,negocio,folio,fecha,kg)
        values(${viaje},${negocio},${datos.folio},${datos.fecha},${datos.kg})`;
      break;
    case 'ticketFabrica': {
      const [entrega] = await sql`select folio from campo.remisiones_entrega where viaje=${viaje}`;
      if (!entrega) throw new BadRequestException('Emite la remisión de entrega primero.');
      const [previo] = await sql`select * from campo.tickets_fabrica where viaje=${viaje}`;
      if (previo && !datos.motivo) throw new BadRequestException('Indica el motivo de la corrección.');
      await sql`insert into campo.tickets_fabrica(viaje,folio,fecha,kg)
        values(${viaje},${datos.folio},${datos.fecha},${datos.kg})
        on conflict(viaje) do update set folio=excluded.folio,fecha=excluded.fecha,kg=excluded.kg`;
      return { previo: previo ?? null, nuevo: datos };
    }
    case 'recepcion': {
      const [entrega] = await sql`select folio from campo.remisiones_entrega where viaje=${viaje}`;
      if (!entrega || entrega.folio !== datos.folio) {
        throw new BadRequestException('El folio debe coincidir con la remisión de entrega del viaje.');
      }
      const [previa] = await sql`select * from campo.recepciones where viaje=${viaje}`;
      if (previa && !datos.motivo) throw new BadRequestException('Indica el motivo de la corrección.');
      await sql`insert into campo.recepciones(viaje,negocio,cliente,folio,sap,orden,fecha,kg_correo,venta)
        values(${viaje},${negocio},${actual.customer.toLowerCase()},${datos.folio},${datos.sap.toUpperCase()},
        ${datos.orden},${datos.fecha},${datos.kgCorreo},${datos.venta})
        on conflict(viaje) do update set folio=excluded.folio,sap=excluded.sap,orden=excluded.orden,
        fecha=excluded.fecha,kg_correo=excluded.kg_correo,venta=excluded.venta`;
      return { previa: previa ?? null, nueva: datos };
    }
    case 'abono':
      await sql`insert into campo.abonos_chofer(viaje,fecha,importe,referencia)
        values(${viaje},${datos.fecha},${datos.importe},${datos.referencia})`;
      break;
    case 'cierre': {
      const [estado] = await sql`select exists(select 1 from campo.recepciones r
        join campo.tickets_fabrica f using(viaje) where r.viaje=${viaje} and f.kg=r.kg_correo) confirmado,
        exists(select 1 from campo.gastos where viaje=${viaje} and estado<>'aprobado') pendiente`;
      if (!estado.confirmado || estado.pendiente) {
        throw new ConflictException('Confirma la recepción y aprueba todos los gastos para cerrar.');
      }
      await sql`update campo.trips set cerrado_en=now() where id=${viaje}`;
      break;
    }
  }
  return datos;
}
