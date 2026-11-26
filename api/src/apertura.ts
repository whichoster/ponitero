import { ConflictException } from '@nestjs/common';
import { z } from 'zod';
import type postgres from 'postgres';

const texto = z.string().trim().min(1).max(100);
const decimal = (escala: number) => z.string().trim().regex(
  new RegExp('^\\d{1,9}(\\.\\d{1,' + escala + '})?$'),
);

export const vehiculo = z.object({
  chofer: texto,
  placas: texto.refine(value => value.replace(/[\s-]/g, '').length > 0),
  vehiculo: z.enum(['Torton', 'Rabón', 'Camioneta', 'Jaula']),
  canastos: z.string().regex(/^\d{1,9}$/).refine(value => Number(value) > 0),
  tara: decimal(3).optional(),
});

export const apertura = z.object({
  reference: z.string().trim().min(1).max(50),
  customer: texto.min(2),
  producto: texto,
  variedad: texto,
  fecha: z.iso.date(),
  kg: decimal(3).refine(value => Number(value) > 0),
  venta: decimal(4),
  ...vehiculo.shape,
  fleteChofer: decimal(4),
  fleteCliente: decimal(4).optional(),
});

type Apertura = z.infer<typeof apertura>;

export function acuerdosDeApertura(datos: Apertura) {
  const { producto, fecha, chofer, placas, vehiculo, venta, fleteChofer, fleteCliente = '0' } = datos;
  return { accion: 'acuerdos', producto, fecha, chofer, placas, vehiculo, venta, fleteChofer, fleteCliente };
}

// Las operaciones que asignan placas toman el bloqueo exclusivo del negocio.
export async function verificarPlacas(sql: postgres.TransactionSql, negocio: string, placas: string, viaje?: string) {
  const [ocupado] = await sql`select 1 from campo.trips
    where business_id=${negocio} and cerrado_en is null
      and id is distinct from ${viaje ?? null}::uuid
      and upper(regexp_replace(coalesce(apertura->>'placas', acuerdos->>'placas'), '[[:space:]-]+', '', 'g')) =
        upper(regexp_replace(${placas}, '[[:space:]-]+', '', 'g')) limit 1`;
  if (ocupado) throw new ConflictException('El vehículo ya está asignado a un viaje abierto de este negocio.');
}

export async function crearViaje(sql: postgres.TransactionSql, negocio: string, datos: Apertura) {
  await verificarPlacas(sql, negocio, datos.placas);
  const [viaje] = await sql`insert into campo.trips (business_id,reference,customer,apertura,acuerdos)
    values (${negocio},${datos.reference},${datos.customer},${sql.json(datos)},${sql.json(acuerdosDeApertura(datos))})
    returning id,reference,customer`;
  return viaje;
}
