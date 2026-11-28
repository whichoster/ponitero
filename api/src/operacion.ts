import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

const conceptosTicket = ['corte','estiba','flete local','vaciado','pasaje'] as const;

const gasto = z.object({
  ticket: z.uuid().optional(), concepto: texto, fecha: z.iso.date(),
  beneficiario: z.string().trim().min(1).max(254), tarifa: tarifa.optional(), importe: dinero,
  origen: z.enum(['directo','mensaje','llamada']), motivo: texto.optional(),
});

const datosTicket = z.object({
  folio: texto, finca: texto, variedad: z.enum(['Cayena','MD2','Champaca','Otra']),
  descripcion: texto.optional(), kg: peso,
});

const escenarioCompra = z.object({
  kg: peso, merma: decimal(4).refine(value => Number(value) <= 100),
  gastos: dinero,
  partidas: z.array(z.object({ productor: texto, kg: peso, tarifa, gastos: dinero })).max(100),
});

export const operacion = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('acuerdos'), fecha: z.iso.date(), producto: texto,
    chofer: texto, vehiculo: texto, placas: texto, venta: tarifa, fleteChofer: tarifa, fleteCliente: tarifa }),
  z.object({ accion: z.literal('plan'), kg: peso, merma: decimal(4).refine(x => Number(x) <= 100), gastos: dinero, oferta: tarifa.optional() }),
  escenarioCompra.extend({ accion: z.literal('simularCompra') }),
  escenarioCompra.extend({ accion: z.literal('guardarEscenario') }),
  datosTicket.extend({ accion: z.literal('compra'), productor: texto, tarifa, reserva: dinero }),
  datosTicket.extend({ accion: z.literal('corregirCompra'), ticket: z.uuid(),
    version: z.number().int().positive(), motivo: texto }),
  gasto.extend({ accion: z.literal('gasto') }),
  z.object({ accion: z.literal('tarifaGasto'), ambito: z.enum(['viaje','finca','productor']),
    referencia: texto.optional(), concepto: z.enum(conceptosTicket), tarifa, motivo: texto }),
  z.object({
    accion: z.literal('gastos'),
    ...gasto.pick({ fecha: true, beneficiario: true, origen: true, motivo: true }).shape,
    partidas: z.array(z.object({
      concepto: z.enum(['corte','estiba','canastos','escalera','flete local','pasaje','mandados','combustible propio','agua','lonches','otro']),
      importe: dinero.refine(value => Number(value) > 0),
    })).min(1).max(5).refine(partidas => {
      const conceptos = partidas.map(item => item.concepto);
      return new Set(conceptos).size === conceptos.length &&
        conceptos.filter(concepto => !['corte','estiba','canastos','escalera'].includes(concepto)).length <= 1;
    }),
  }),
  z.object({ accion: z.literal('revision'), gasto: z.uuid(), estado: z.enum(['aprobado','devuelto']),
    importe: dinero, motivo: texto }),
  z.object({ accion: z.literal('entrega'), fecha: z.iso.date().optional() }),
  z.object({ accion: z.literal('ticketFabrica'), folio: texto, fecha: z.iso.date(), kg: peso, motivo: texto.optional() }),
  z.object({ accion: z.literal('recepcion'), folio: texto, sap: texto, orden: texto,
    fecha: z.iso.date(), kgCorreo: peso, venta: dinero, motivo: texto.optional() }),
  z.object({ accion: z.literal('abono'), fecha: z.iso.date(), importe: dinero.refine(x => Number(x) > 0), referencia: texto }),
  z.object({ accion: z.literal('cierre'), motivo: texto }),
]);

export async function expediente(sql: Sql, viaje: string, incluirTarifas = true) {
  const [resumen] = await sql`
    with base as (
      select t.customer, t.acuerdos, nullif(t.apertura->>'kg','') kg_previstos, t.acuerdos->>'fecha' fecha_viaje,
        'C-' || case when t.consecutivo_compra<10 then '0' else '' end || t.consecutivo_compra folio_compra, t.cerrado_en, t.reasignado_en, f.kg kg_ticket, r.kg_correo, r.venta,
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
      select *, case when kg_previstos is not null then greatest(0, kg_previstos::numeric-kg_comprados) end kg_pendientes,
        round(kg_ticket * (acuerdos->>'fleteChofer')::numeric / 1000,2) flete_chofer,
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
        coalesce((escenario->'resultado'->>'reserva')::numeric,round(venta*0.0125,2)) reserva from importes
    )
    select id, creado_en, kg, merma, gastos, oferta, escenario,
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
    select pesos.*, ${resumen.folio_compra} || '-' || r.sufijo folio,
      round(${planes[0]?.reserva ?? '0'}::numeric*acumulado/total,2)
      - round(${planes[0]?.reserva ?? '0'}::numeric*(acumulado-kg)/total,2) reserva_sugerida
    from pesos join campo.remisiones_compra r on r.viaje=${viaje} and r.productor=pesos.productor
    order by r.sufijo`;
  const gastos = await sql`select * from campo.gastos where viaje=${viaje} order by fecha,id`;
  const abonos = await sql`select * from campo.abonos_chofer where viaje=${viaje} order by fecha,id`;
  const [recepcion] = await sql`select *, fecha::text as fecha_capturada from campo.recepciones where viaje=${viaje}`;
  const [entrega] = await sql`select viaje,negocio,folio,fecha::text,kg from campo.remisiones_entrega where viaje=${viaje}`;
  const [ticketFabrica] = await sql`select viaje,folio,fecha::text,kg from campo.tickets_fabrica where viaje=${viaje}`;
  const tarifas = incluirTarifas ? await sql`
    select r.ambito,r.referencia,r.concepto,r.tarifa from campo.tarifas_gasto r
    join campo.trips t on t.id=${viaje} and t.business_id=r.negocio
    where (r.ambito='viaje' and r.referencia=t.id::text)
      or r.ambito in ('finca','productor')
    order by r.ambito,r.referencia,r.concepto` : [];
  const sugerencias = incluirTarifas ? await sql`
    select distinct on (c.id,r.concepto) c.id ticket,r.concepto,r.tarifa,
      round(c.kg*r.tarifa/1000,2) importe
    from campo.compras c join campo.trips t on t.id=c.viaje
    join campo.tarifas_gasto r on r.negocio=t.business_id
      and ((r.ambito='viaje' and r.referencia=t.id::text)
        or (r.ambito='finca' and r.referencia=c.finca)
        or (r.ambito='productor' and r.referencia=c.productor))
    where c.viaje=${viaje}
    order by c.id,r.concepto,case r.ambito when 'viaje' then 1 when 'finca' then 2 else 3 end` : [];
  return { resumen, planes, compras, remisiones, gastos, abonos, recepcion, entrega, ticketFabrica, tarifas, sugerencias };
}

export async function registrarOperacion(
  sql: Sql, viaje: string, negocio: string, datos: z.infer<typeof operacion>, rol: string,
) {
  const [actual] = await sql`select customer,acuerdos,cerrado_en,reasignado_en from campo.trips where id=${viaje} for update`;
  if (datos.accion === 'entrega') {
    const [existente] = await sql`select viaje,negocio,folio,fecha::text,kg from campo.remisiones_entrega where viaje=${viaje}`;
    if (existente) return { entrega: existente, existente: true };
  }
  if (actual.reasignado_en) throw new ConflictException('El expediente del viaje reasignado es de solo lectura.');
  if (actual.cerrado_en && !['gasto','gastos','revision','abono'].includes(datos.accion)) {
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
    case 'simularCompra':
    case 'guardarEscenario': {
      const [resultado] = await sql`
        with partidas as (
          select coalesce(sum(kg),0) kg,coalesce(sum(round(kg*tarifa/1000,2)),0) costo,coalesce(sum(gastos),0) gastos
          from jsonb_to_recordset(${sql.json(datos.partidas)}::jsonb) as p(kg numeric,tarifa numeric,gastos numeric)
        ), registradas as (
          select coalesce(sum(kg),0) kg,coalesce(sum(importe),0) costo from campo.compras where viaje=${viaje}
        ), carga as (
          select ${datos.kg}::numeric objetivo,registradas.kg comprometidos,partidas.kg propuestos,
            registradas.costo costo_comprometido,partidas.costo costo_propuesto,
            ${datos.gastos}::numeric+partidas.gastos otros_gastos,
            (registradas.kg+partidas.kg)*(1-${datos.merma}::numeric/100) kg_recibidos
          from partidas cross join registradas
        ), ingresos as (
          select *,round(kg_recibidos*(${actual.acuerdos.venta}::numeric)/1000,2) venta,
            round(kg_recibidos*(${actual.acuerdos.fleteCliente}::numeric)/1000,2) flete_cliente,
            round(kg_recibidos*(${actual.acuerdos.fleteChofer}::numeric)/1000,2) flete_chofer
          from carga
        ), costos as (
          select *,round(venta*0.0125,2) reserva,
            costo_comprometido+costo_propuesto+otros_gastos+flete_chofer costo_total
          from ingresos
        )
        select *, greatest(0,objetivo-comprometidos-propuestos) kg_pendientes,
          venta+flete_cliente-costo_total-reserva utilidad,
          round(100*(venta+flete_cliente-costo_total-reserva)/nullif(venta+flete_cliente,0),2) margen,
          (comprometidos+propuestos=objetivo) carga_completa
        from costos`;
      if (datos.accion === 'simularCompra') return { resultado, existente: true };
      if (!resultado.carga_completa) throw new BadRequestException('Las compras registradas y propuestas deben completar la carga prevista.');
      const escenario = { partidas: datos.partidas, resultado };
      const [nuevo] = await sql`insert into campo.planes(viaje,kg,merma,gastos,escenario)
        values (${viaje},${datos.kg},${datos.merma},${datos.gastos},${sql.json(escenario as unknown as postgres.JSONValue)})
        returning id`;
      return { resultado, nuevo };
    }
    case 'compra':
    case 'corregirCompra': {
      if (datos.variedad === 'Otra' && !datos.descripcion) throw new BadRequestException('Describe la variedad.');
      const variedad = datos.variedad === 'Otra' ? datos.descripcion! : datos.variedad;
      if (datos.accion === 'compra') {
        await sql`insert into campo.remisiones_compra (viaje,productor,sufijo)
          select ${viaje},${datos.productor},coalesce(max(sufijo),0)+1
          from campo.remisiones_compra where viaje=${viaje}
          on conflict (viaje,productor) do nothing`;
        const [nuevo] = await sql`insert into campo.compras(viaje,folio,finca,productor,variedad,kg,tarifa,reserva)
          values(${viaje},${datos.folio},${datos.finca},${datos.productor},${variedad},
          ${datos.kg},${datos.tarifa},${datos.reserva}) returning *`;
        return { nuevo };
      }
      const [previo] = await sql`select * from campo.compras where viaje=${viaje} and id=${datos.ticket}`;
      if (!previo) throw new NotFoundException('Ticket de finca no encontrado.');
      if (previo.version !== datos.version) throw new ConflictException('El ticket cambió. Recarga el expediente antes de corregirlo.');
      const [nuevo] = await sql`update campo.compras set folio=${datos.folio},finca=${datos.finca},
        variedad=${variedad},kg=${datos.kg},version=version+1 where id=${datos.ticket} returning *`;
      if (previo.kg !== nuevo.kg) {
        await sql`update campo.gastos set requiere_revision_ticket=true where viaje=${viaje} and ticket=${datos.ticket}`;
      }
      return { previo, nuevo };
    }
    case 'tarifaGasto': {
      const referencia = datos.ambito === 'viaje' ? viaje : datos.referencia;
      if (!referencia) throw new BadRequestException('Indica la finca o el productor.');
      await sql`select pg_advisory_xact_lock(hashtextextended(
        concat_ws('|',${negocio}::text,${datos.ambito}::text,${referencia}::text,${datos.concepto}::text),0))`;
      const [previo] = await sql`select tarifa from campo.tarifas_gasto where negocio=${negocio}
        and ambito=${datos.ambito} and referencia=${referencia} and concepto=${datos.concepto}`;
      const [nuevo] = await sql`insert into campo.tarifas_gasto(negocio,ambito,referencia,concepto,tarifa)
        values (${negocio},${datos.ambito},${referencia},${datos.concepto},${datos.tarifa})
        on conflict (negocio,ambito,referencia,concepto) do update set tarifa=excluded.tarifa
        returning ambito,referencia,concepto,tarifa`;
      return { previo: previo ?? null,nuevo };
    }
    case 'gasto':
    case 'gastos': {
      if (actual.cerrado_en && (!datos.motivo || rol === 'encargado')) {
        throw new ConflictException('Un gasto posterior al cierre requiere captura administrativa y motivo.');
      }
      if (rol === 'encargado' && datos.origen !== 'directo') throw new BadRequestException('El origen reportado se captura por administración.');
      const partidas: Pick<z.infer<typeof gasto>, 'concepto' | 'importe' | 'ticket' | 'tarifa'>[] =
        datos.accion === 'gasto' ? [datos] : datos.partidas;
      const cambios = [];
      for (const partida of partidas) {
        const concepto = partida.concepto.toLocaleLowerCase('es-MX');
        if (concepto === 'combustible del camión') throw new BadRequestException('Registra ese pago como abono al flete.');
        if (partida.ticket) {
          if (!partida.tarifa || !conceptosTicket.some(permitido => permitido === concepto)) {
            throw new BadRequestException('Verifica el concepto y la tarifa por tonelada.');
          }
          const [ticket] = await sql`select round(kg*${partida.tarifa}::numeric/1000,2)=${partida.importe}::numeric coincide
            from campo.compras where viaje=${viaje} and id=${partida.ticket}`;
          if (!ticket) throw new BadRequestException('Verifica el ticket de finca.');
          if (!ticket.coincide && !datos.motivo) throw new BadRequestException('Indica el motivo del ajuste de importe.');
        }
        const [registro] = await sql`insert into campo.gastos(viaje,ticket,concepto,fecha,beneficiario,tarifa,importe,origen,motivo)
          values(${viaje},${partida.ticket ?? null},${concepto},${datos.fecha},${datos.beneficiario},
          ${partida.tarifa ?? null},${partida.importe},${datos.origen},${datos.motivo ?? null})
          returning id,concepto,importe`;
        cambios.push(registro);
      }
      return { gastos: cambios };
    }
    case 'revision': {
      const [previo] = await sql`select estado,importe,requiere_revision_ticket from campo.gastos where viaje=${viaje} and id=${datos.gasto}`;
      if (!previo) throw new BadRequestException('Gasto no encontrado.');
      await sql`update campo.gastos set estado=${datos.estado},importe=${datos.importe},requiere_revision_ticket=false where id=${datos.gasto}`;
      return { previo, nuevo: datos };
    }
    case 'entrega': {
      const [ticket] = await sql`select fecha::text,kg from campo.tickets_fabrica
        where viaje=${viaje} and btrim(folio)<>'' and kg>0`;
      if (!ticket) throw new BadRequestException('Completa el ticket de fábrica antes de emitir la remisión.');
      const [contador] = await sql`insert into campo.consecutivos_remision_entrega (negocio,ultimo)
        values (${negocio},1) on conflict (negocio) do update
        set ultimo=campo.consecutivos_remision_entrega.ultimo+1 returning ultimo::text`;
      const [entrega] = await sql`insert into campo.remisiones_entrega(viaje,negocio,folio,fecha,kg)
        values(${viaje},${negocio},${'F-' + contador.ultimo},${datos.fecha ?? ticket.fecha},${ticket.kg})
        returning viaje,negocio,folio,fecha::text,kg`;
      return { entrega };
    }
    case 'ticketFabrica': {
      const [previo] = await sql`select viaje,folio,fecha::text,kg from campo.tickets_fabrica where viaje=${viaje}`;
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
