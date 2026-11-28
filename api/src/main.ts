import 'reflect-metadata';
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Delete, Get, Headers, HttpCode, Module, NotFoundException, Param, Patch, Post, Query as ParamQuery, UnauthorizedException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiBearerAuth, ApiBody, DocumentBuilder, SwaggerModule, type SchemaObject } from '@nestjs/swagger';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { z } from 'zod';
import { apertura, acuerdosDeApertura, crearViaje, vehiculo, verificarPlacas } from './apertura';
import { expediente, operacion, registrarOperacion } from './operacion';
import { cobro, estadoCobranza, registrarCobro } from './cobranza';

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error('Falta la variable ' + name);
  return value;
}

const auth = () => createClient(env('SUPABASE_URL'), env('SUPABASE_PUBLIC_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth;
const db = postgres(env('DATABASE_URL'), { prepare: false });
type Query = postgres.Sql | postgres.TransactionSql;
const uuid = z.uuid();
const email = z.email().max(254);
const credentials = z.object({ email, password: z.string().min(8).max(72) });
const businessInput = z.object({ name: z.string().trim().min(2).max(100) });
const reasonInput = z.string().trim().min(3).max(300);
const statusInput = z.object({ status: z.enum(['aprobado', 'suspendido']), reason: reasonInput });
const memberInput = z.object({
  email, role: z.enum(['administrador', 'encargado']), reason: reasonInput,
  canManageWorkers: z.boolean().optional(),
});
const permissionInput = z.object({ canManageWorkers: z.boolean(), reason: reasonInput });
const removalInput = z.object({ reason: reasonInput });
const deletionInput = removalInput.extend({ confirm: z.literal(true) });
const bulkRemoval = removalInput.extend({ userIds: z.array(uuid).min(1).refine(ids => new Set(ids).size === ids.length) });
const revisionBase = z.object({ version: z.number().int().positive() });
const reviewInput = z.discriminatedUnion('action', [
  revisionBase.extend({ action: z.literal('aprobar'), datos: apertura.optional() }),
  revisionBase.extend({ action: z.literal('devolver'), reason: reasonInput, datos: apertura.optional() }),
  revisionBase.extend({ action: z.literal('cancelar'), reason: reasonInput, confirm: z.literal(true) }),
]);
const reassignmentInput = removalInput.extend({ userId: uuid });
const assignmentInput = z.object({ userId: uuid });
const input = (schema: z.ZodType) => ApiBody({ schema: z.toJSONSchema(schema) as SchemaObject });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException('Revisa los datos ingresados.');
  return result.data;
}

async function actor(header: string | undefined) {
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Inicia sesión.');
  const { data, error } = await auth().getUser(header.slice(7));
  if (error || !data.user) throw new UnauthorizedException('La sesión no es válida.');
  return data.user;
}

async function isSuper(sql: Query, userId: string) {
  const [row] = await sql`select 1 from campo.platform_admins where user_id=${userId}`;
  return Boolean(row);
}

async function audit(sql: Query, businessId: string, actorId: string, action: string, details: postgres.JSONValue) {
  await sql`insert into campo.audit (business_id, actor_id, action, details)
    values (${businessId}, ${actorId}, ${action}, ${sql.json(details)})`;
}

async function access(sql: Query, businessId: string, userId: string, write: boolean | 'exclusive' = false, lock = false) {
  const superAdmin = await isSuper(sql, userId);
  const [business] = lock || write === 'exclusive'
    ? await sql`select status from campo.businesses where id=${businessId} and deleted_at is null for update`
    : await sql`select status from campo.businesses where id=${businessId} and deleted_at is null for share`;
  const [member] = await sql`select role,can_manage_workers from campo.members
    where business_id=${businessId} and user_id=${userId}`;
  if (!business || (!superAdmin && !member)) throw new NotFoundException('Negocio no encontrado.');
  if (!superAdmin && business.status !== 'aprobado' && write !== 'exclusive') {
    throw new ForbiddenException('El negocio requiere aprobación.');
  }
  const role = superAdmin ? 'superadministrador' : member.role;
  if (write && role === 'encargado') throw new ForbiddenException('Operación reservada al administrador.');
  return { role, canManageWorkers: superAdmin || Boolean(member?.can_manage_workers), status: business.status };
}

function gastosVisibles(gastos: postgres.Row[]) {
  return gastos.map(({ id, concepto, fecha, beneficiario, importe, estado, cantidad, tarifa_unitaria }) =>
    ({ id, concepto, fecha, beneficiario, importe, estado, cantidad, tarifa_unitaria }));
}

function conflict(error: unknown): never {
  if (error instanceof postgres.PostgresError && error.code === '23505') {
    throw new ConflictException('Ya existe un registro con esos datos.');
  }
  throw error;
}

@Controller()
class CampoController {
  @Get('health')
  async health() {
    await db`select 1`;
    return { ok: true };
  }

  @Post('auth/register')
  @input(credentials)
  async register(@Body() body: unknown) {
    const { email, password } = parse(credentials, body);
    const { error } = await auth().signUp({ email, password });
    if (error) throw new BadRequestException('No se pudo registrar la cuenta.');
    return { message: 'Cuenta registrada. Inicia sesión o confirma tu correo si es necesario.' };
  }

  @Post('auth/login')
  @HttpCode(200)
  @input(credentials)
  async login(@Body() body: unknown) {
    const { email, password } = parse(credentials, body);
    const { data, error } = await auth().signInWithPassword({ email, password });
    if (error || !data.session) throw new UnauthorizedException('Correo o contraseña incorrectos.');
    return { accessToken: data.session.access_token };
  }

  @Get('me')
  @ApiBearerAuth()
  async me(@Headers('authorization') header: string) {
    const user = await actor(header);
    const superAdmin = await isSuper(db, user.id);
    const rows = await db`select b.id,b.name,b.status,m.role from campo.businesses b
      left join campo.members m on m.business_id=b.id and m.user_id=${user.id}
      where b.deleted_at is null and (${superAdmin} or m.user_id is not null) order by b.created_at desc`;
    return {
      email: user.email, superAdmin,
      canRegisterBusiness: !superAdmin && !rows.some(item => item.role === 'administrador'),
      businesses: rows.map(item => ({
        ...item,
        canDelete: superAdmin || item.role === 'administrador',
        canOpen: superAdmin || item.status === 'aprobado',
        nextStatus: superAdmin ? (item.status === 'aprobado' ? 'suspendido' : 'aprobado') : null,
      })),
    };
  }

  @Post('businesses')
  @ApiBearerAuth()
  @input(businessInput)
  async registerBusiness(@Headers('authorization') header: string, @Body() body: unknown) {
    const user = await actor(header);
    const { name } = parse(businessInput, body);
    return db.begin(async sql => {
      const [business] = await sql`insert into campo.businesses (name,owner_id)
        values (${name},${user.id}) returning id,name,status`;
      await sql`insert into campo.members (business_id,user_id,role) values (${business.id},${user.id},'administrador')`;
      await audit(sql, business.id, user.id, 'registro', { name });
      return business;
    }).catch(async error => {
      if (error instanceof postgres.PostgresError && error.code === '23505') {
        const match = await this.nameMatch(name, user.id);
        if (match.duplicate) throw new ConflictException(match);
      }
      conflict(error);
    });
  }

  @Post('businesses/name-check')
  @HttpCode(200)
  @ApiBearerAuth()
  @input(businessInput)
  async checkName(@Headers('authorization') header: string, @Body() body: unknown) {
    const user = await actor(header);
    return this.nameMatch(parse(businessInput, body).name, user.id);
  }

  private async nameMatch(name: string, userId: string) {
    const superAdmin = await isSuper(db, userId);
    const [row] = await db`select b.id, (${superAdmin} or m.user_id is not null) accessible
      from campo.businesses b left join campo.members m on m.business_id=b.id and m.user_id=${userId}
      where b.deleted_at is null and campo.business_name_key(b.name)=campo.business_name_key(${name})
      order by accessible desc, b.created_at, b.id limit 1`;
    return {
      duplicate: Boolean(row),
      existingId: row?.accessible ? row.id : null,
      message: row ? 'Ya existe un negocio con ese nombre.' : '',
    };
  }

  @Delete('businesses/:id')
  @ApiBearerAuth()
  @input(deletionInput)
  async deleteBusiness(@Headers('authorization') header: string, @Param('id') id: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const { reason } = parse(deletionInput, body);
    return db.begin(async sql => {
      await access(sql, businessId, user.id, 'exclusive');
      await sql`update campo.businesses set deleted_at=now() where id=${businessId}`;
      await audit(sql, businessId, user.id, 'eliminacion_negocio', { reason });
      return { ok: true };
    });
  }

  @Patch('businesses/:id/status')
  @ApiBearerAuth()
  @input(statusInput)
  async status(@Headers('authorization') header: string, @Param('id') id: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const { status, reason } = parse(statusInput, body);
    return db.begin(async sql => {
      if (!await isSuper(sql, user.id)) throw new ForbiddenException('Solo el superadministrador puede cambiar el estado.');
      const [current] = await sql`select status from campo.businesses where id=${businessId} and deleted_at is null for update`;
      if (!current) throw new NotFoundException('Negocio no encontrado.');
      if (current.status === status || (current.status === 'pendiente' && status === 'suspendido')) {
        throw new ConflictException('Ese cambio de estado no está disponible.');
      }
      const [updated] = await sql`update campo.businesses set status=${status}
        where id=${businessId} returning id,name,status`;
      await audit(sql, businessId, user.id, 'estado_negocio', { previous: current.status, status, reason });
      return updated;
    });
  }

  @Get('businesses/:id/cobranza')
  @ApiBearerAuth()
  async cobrarEstado(@Headers('authorization') header: string, @Param('id') id: string) {
    const user = await actor(header);
    const negocio = parse(uuid, id);
    return db.begin('isolation level repeatable read', async sql => {
      await access(sql, negocio, user.id, true);
      return estadoCobranza(sql, negocio);
    });
  }

  @Post('businesses/:id/cobranza')
  @ApiBearerAuth()
  @input(cobro)
  async cobrarRegistro(@Headers('authorization') header: string, @Param('id') id: string, @Body() body: unknown) {
    const user = await actor(header);
    const negocio = parse(uuid, id);
    const datos = parse(cobro, body);
    return db.begin(async sql => {
      await access(sql, negocio, user.id, true, true);
      const resultado = await registrarCobro(sql, negocio, datos);
      await audit(sql, negocio, user.id, 'cobranza_' + datos.accion, { datos, resultado });
      return resultado;
    }).catch(conflict);
  }

  @Get('businesses/:id/export')
  @ApiBearerAuth()
  async exportBusiness(@Headers('authorization') header: string, @Param('id') id: string) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    return db.begin('isolation level repeatable read', async sql => {
      await access(sql, businessId, user.id, true);
      const [negocio] = await sql`select id,name,status from campo.businesses where id=${businessId}`;
      const viajes = await sql`select id,reference,customer,apertura,acuerdos,created_at,
        cerrado_en,reasignado_en from campo.trips where business_id=${businessId} order by created_at,id`;
      const expedientes = [];
      for (const viaje of viajes) {
        expedientes.push({ viaje, expediente: await expediente(sql, viaje.id, false) });
      }
      return { version: 1, negocio, exportado_en: new Date().toISOString(), viajes: expedientes };
    });
  }

  @Get('businesses/:id')
  @ApiBearerAuth()
  async details(@Headers('authorization') header: string, @Param('id') id: string) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    return db.begin(async sql => {
      const { role, canManageWorkers } = await access(sql, businessId, user.id);
      const canManageTrips = role !== 'encargado';
      const trips = await sql`select t.id,t.reference,t.customer, case when ${canManageTrips} then t.apertura end apertura,
        (t.acuerdos is not null) as can_open,
        coalesce(t.apertura ? 'canastos', false) as vehicle_assigned, t.reasignado_en, t.cerrado_en,
        (t.cerrado_en is null and t.reasignado_en is null) as can_assign_vehicle,
        coalesce((
          select jsonb_object_agg(key,value) from jsonb_each(coalesce(t.apertura,t.acuerdos))
          where key in ('chofer','placas','vehiculo','canastos','tara')
        ), '{}'::jsonb) as vehicle,
        case when ${canManageTrips} then
          array(select a.user_id from campo.assignments a where a.trip_id=t.id order by a.user_id)
        else array[]::uuid[] end assigned
        from campo.trips t where t.business_id=${businessId} and
        (${canManageTrips} or exists (
          select 1 from campo.assignments a where a.trip_id=t.id and a.user_id=${user.id}
        )) order by t.created_at desc`;
      const members = canManageTrips ? await sql`select m.user_id,u.email,m.role,m.can_manage_workers from campo.members m
        join auth.users u on u.id=m.user_id where m.business_id=${businessId}
          and m.role='encargado' order by u.email` : [];
      const history = canManageTrips ? await sql`select a.id,a.action,a.details,a.created_at,u.email
        from campo.audit a join auth.users u on u.id=a.actor_id
        where a.business_id=${businessId} order by a.id desc limit 50` : [];
      const requests = await sql`select r.id,r.datos,r.status,r.reason,r.trip_id,r.version,r.source_trip_id,u.email,
          (select json_agg(json_build_object('id',a.id,'action',a.action,'created_at',a.created_at,
            'email',actor.email,'reason',a.details->>'reason') order by a.id)
            from campo.audit a join auth.users actor on actor.id=a.actor_id
            where a.business_id=r.business_id and a.details->>'requestId'=r.id::text) as history,
          exists(select 1 from campo.members m where m.business_id=r.business_id
            and m.user_id=r.requester_id and m.role='encargado') as can_approve
        from campo.trip_requests r join auth.users u on u.id=r.requester_id
        where r.business_id=${businessId} and (${canManageTrips} or r.requester_id=${user.id})
        order by r.created_at desc`;
      return { role, canManageTrips, canManageWorkers, trips, members, history, requests };
    });
  }

  @Get('businesses/:id/members')
  @ApiBearerAuth()
  async listMembers(@Headers('authorization') header: string, @Param('id') id: string, @ParamQuery('page') page?: string) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const requested = parse(z.coerce.number().int().min(1).max(100_000_000), page ?? '1');
    return db.begin(async sql => {
      const { role, canManageWorkers } = await access(sql, businessId, user.id, true);
      const [count] = await sql`select count(*)::int total from campo.members where business_id=${businessId}`;
      const actualPage = Math.min(requested, Math.max(1, Math.ceil(count.total / 20)));
      const superAdmin = role === 'superadministrador';
      const members = await sql`select m.user_id,u.email,m.role,m.can_manage_workers,
        (${superAdmin} and m.role='administrador') as can_edit,
        (${superAdmin} or (${canManageWorkers} and m.role='encargado')) as can_remove
        from campo.members m join auth.users u on u.id=m.user_id where m.business_id=${businessId}
        order by lower(u.email),m.user_id limit 20 offset ${(actualPage - 1) * 20}`;
      return { members, total: count.total, page: actualPage, superAdmin, canAdd: canManageWorkers };
    });
  }

  @Post('businesses/:id/members/bulk-removal')
  @ApiBearerAuth()
  @input(bulkRemoval)
  async bulkRemove(@Headers('authorization') header: string, @Param('id') id: string, @Body() body: unknown) {
    const user = await actor(header);
    const { userIds, reason } = parse(bulkRemoval, body);
    return this.removeMembers(parse(uuid, id), user.id, userIds, reason);
  }

  @Post('businesses/:id/members')
  @ApiBearerAuth()
  @input(memberInput)
  async member(@Headers('authorization') header: string, @Param('id') id: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const { email, role, reason, canManageWorkers = false } = parse(memberInput, body);
    return db.begin(async sql => {
      await this.memberAccess(sql, businessId, user.id, role);
      const [account] = await sql`select id,email from auth.users
        where lower(email)=lower(${email}) and email_confirmed_at is not null`;
      if (!account) throw new NotFoundException('La persona debe crear y confirmar su cuenta primero.');
      await sql`insert into campo.members (business_id,user_id,role,can_manage_workers)
        values (${businessId},${account.id},${role},${role === 'administrador' && canManageWorkers})`;
      await audit(sql, businessId, user.id, 'alta_' + role, { userId: account.id, email: account.email, reason, canManageWorkers });
      return account;
    }).catch(conflict);
  }

  @Patch('businesses/:id/members/:memberId')
  @ApiBearerAuth()
  @input(permissionInput)
  async memberPermission(@Headers('authorization') header: string, @Param('id') id: string,
    @Param('memberId') memberId: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const target = parse(uuid, memberId);
    const { canManageWorkers, reason } = parse(permissionInput, body);
    return db.begin(async sql => {
      await this.memberAccess(sql, businessId, user.id, 'administrador');
      const [updated] = await sql`update campo.members set can_manage_workers=${canManageWorkers}
        where business_id=${businessId} and user_id=${target} and role='administrador' returning user_id`;
      if (!updated) throw new NotFoundException('Administrador no encontrado.');
      await audit(sql, businessId, user.id, 'permiso_encargados', { userId: target, canManageWorkers, reason });
      return { ok: true };
    });
  }

  @Delete('businesses/:id/members/:memberId')
  @ApiBearerAuth()
  @input(removalInput)
  async removeMember(@Headers('authorization') header: string, @Param('id') id: string,
    @Param('memberId') memberId: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const target = parse(uuid, memberId);
    const { reason } = parse(removalInput, body);
    return this.removeMembers(businessId, user.id, [target], reason);
  }

  private async removeMembers(businessId: string, actorId: string, userIds: string[], reason: string) {
    return db.begin(async sql => {
      const { role, canManageWorkers, status } = await access(sql, businessId, actorId, 'exclusive');
      const members = await sql`select user_id,role from campo.members
        where business_id=${businessId} and user_id=any(${userIds}::uuid[])`;
      if (members.length !== userIds.length) throw new NotFoundException('Algún empleado ya no pertenece al negocio.');
      if (role !== 'superadministrador' &&
        (status !== 'aprobado' || !canManageWorkers || members.some(member => member.role !== 'encargado'))) {
        throw new ForbiddenException('No tienes permiso para dar de baja a todos los empleados seleccionados.');
      }
      const assignments = await sql`delete from campo.assignments where business_id=${businessId}
        and user_id=any(${userIds}::uuid[]) returning user_id,trip_id`;
      await sql`delete from campo.members where business_id=${businessId} and user_id=any(${userIds}::uuid[])`;
      for (const member of members) {
        await audit(sql, businessId, actorId, 'baja_' + member.role, {
          userId: member.user_id, reason, tripIds: assignments.filter(item => item.user_id === member.user_id).map(item => item.trip_id),
        });
      }
      return { ok: true };
    });
  }

  private async memberAccess(sql: Query, businessId: string, userId: string, targetRole: string) {
    const { role, canManageWorkers, status } = await access(sql, businessId, userId, 'exclusive');
    if (role === 'superadministrador') return;
    if (targetRole !== 'encargado' || !canManageWorkers || status !== 'aprobado') {
      throw new ForbiddenException('No tienes permiso para gestionar esa cuenta en este negocio.');
    }
  }

  @Post('businesses/:id/trips')
  @ApiBearerAuth()
  @input(apertura)
  async trip(@Headers('authorization') header: string, @Param('id') id: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const datos = parse(apertura, body);
    return db.begin(async sql => {
      await access(sql, businessId, user.id, true, true);
      const trip = await crearViaje(sql, businessId, datos);
      await audit(sql, businessId, user.id, 'alta_viaje', { tripId: trip.id, reference: trip.reference });
      return trip;
    }).catch(conflict);
  }

  @Patch('businesses/:id/trips/:tripId/opening')
  @ApiBearerAuth()
  @input(apertura)
  async completeOpening(@Headers('authorization') header: string, @Param('id') id: string,
    @Param('tripId') trip: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const tripId = parse(uuid, trip);
    return db.begin(async sql => {
      await access(sql, businessId, user.id, true, true);
      const actual = await this.verifyTrip(sql, businessId, tripId, user.id, 'administrador');
      const asignado = vehiculo.safeParse(actual.apertura);
      const datos = parse(apertura, asignado.success ? { ...(body as object), ...asignado.data, tara: asignado.data.tara } : body);
      await verificarPlacas(sql, businessId, datos.placas, tripId);
      const [updated] = await sql`update campo.trips set apertura=${sql.json(datos)},
        acuerdos=${sql.json(acuerdosDeApertura(datos))}
        where business_id=${businessId} and id=${tripId} and reference=${datos.reference}
          and customer=${datos.customer} and acuerdos is null and cerrado_en is null and reasignado_en is null returning id`;
      if (!updated) throw new ConflictException('El viaje no está disponible para completar la apertura.');
      await audit(sql, businessId, user.id, 'apertura_viaje', { tripId });
      return updated;
    });
  }

  @Patch('businesses/:id/trips/:tripId/vehicle')
  @ApiBearerAuth()
  @input(vehiculo)
  async assignVehicle(@Headers('authorization') header: string, @Param('id') id: string,
    @Param('tripId') trip: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const tripId = parse(uuid, trip);
    const datos = parse(vehiculo, body);
    return db.begin(async sql => {
      const { role } = await access(sql, businessId, user.id, false, true);
      const actual = await this.verifyTrip(sql, businessId, tripId, user.id, role);
      if (actual.cerrado_en || actual.reasignado_en || vehiculo.safeParse(actual.apertura).success) {
        throw new ConflictException('El viaje está cerrado o ya tiene un vehículo asignado.');
      }
      await verificarPlacas(sql, businessId, datos.placas, tripId);
      await sql`update campo.trips set apertura=coalesce(apertura,'{}'::jsonb) || ${sql.json(datos)} where id=${tripId}`;
      await audit(sql, businessId, user.id, 'asignacion_vehiculo', { tripId, datos });
      return { ok: true };
    }).catch(conflict);
  }

  @Post('businesses/:id/trip-requests')
  @ApiBearerAuth()
  @input(apertura)
  async requestTrip(@Headers('authorization') header: string, @Param('id') id: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const datos = parse(apertura, body);
    return db.begin(async sql => {
      const { role } = await access(sql, businessId, user.id);
      if (role !== 'encargado') throw new ForbiddenException('Solo los encargados pueden solicitar viajes.');
      await verificarPlacas(sql, businessId, datos.placas);
      const [request] = await sql`insert into campo.trip_requests (business_id,requester_id,datos)
        values (${businessId},${user.id},${sql.json(datos)}) returning id,status`;
      await audit(sql, businessId, user.id, 'envio_solicitud_viaje', { requestId: request.id, datos });
      return request;
    });
  }

  @Patch('businesses/:id/trip-requests/:requestId')
  @ApiBearerAuth()
  @input(apertura)
  async resubmitTrip(@Headers('authorization') header: string, @Param('id') id: string,
    @Param('requestId') request: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const requestId = parse(uuid, request);
    const datos = parse(apertura, body);
    return db.begin(async sql => {
      const { role } = await access(sql, businessId, user.id);
      if (role !== 'encargado') throw new ForbiddenException('Solo el encargado puede reenviar su solicitud.');
      await verificarPlacas(sql, businessId, datos.placas);
      const [updated] = await sql`update campo.trip_requests set datos=${sql.json(datos)},status='pendiente',reason=null,version=version+1
        where id=${requestId} and business_id=${businessId} and requester_id=${user.id}
          and status in ('devuelta','pendiente_correccion') returning id,status`;
      if (!updated) throw new ConflictException('La solicitud no está disponible para correcciones.');
      await audit(sql, businessId, user.id, 'reenvio_solicitud_viaje', { requestId, datos });
      return updated;
    });
  }

  @Post('businesses/:id/trip-requests/:requestId/review')
  @ApiBearerAuth()
  @input(reviewInput)
  async reviewTrip(@Headers('authorization') header: string, @Param('id') id: string,
    @Param('requestId') request: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const requestId = parse(uuid, request);
    const review = parse(reviewInput, body);
    return db.begin(async sql => {
      await access(sql, businessId, user.id, true, true);
      const [current] = await sql`select * from campo.trip_requests
        where business_id=${businessId} and id=${requestId} for update`;
      if (!current) throw new NotFoundException('Solicitud no encontrada.');
      if (current.version !== review.version) throw new ConflictException('La solicitud cambió. Recarga la versión vigente.');
      if (current.status !== 'pendiente') throw new ConflictException('La solicitud ya fue revisada.');
      const datos = review.action === 'cancelar' ? current.datos : review.datos ?? current.datos;
      if (review.action !== 'aprobar') {
        const status = review.action === 'devolver' ? 'devuelta' : 'cancelada';
        await sql`update campo.trip_requests set status=${status},reason=${review.reason},
          datos=${sql.json(datos)},version=version+1 where id=${requestId}`;
        await audit(sql, businessId, user.id, review.action === 'devolver' ? 'devolucion_solicitud_viaje' : 'cancelacion_solicitud_viaje', {
          requestId, reason: review.reason, previo: current.datos, datos,
        });
        return { status };
      }
      const [worker] = await sql`select user_id from campo.members where business_id=${businessId}
        and user_id=${current.requester_id} and role='encargado'`;
      if (!worker) throw new ConflictException('La cuenta solicitante ya no está activa como encargado.');
      const trip = await crearViaje(sql, businessId, parse(apertura, datos));
      await sql`insert into campo.assignments (business_id,trip_id,user_id)
        values (${businessId},${trip.id},${worker.user_id})`;
      await sql`update campo.trip_requests set status='aprobada',trip_id=${trip.id},datos=${sql.json(datos)},version=version+1 where id=${requestId}`;
      await audit(sql, businessId, user.id, 'aprobacion_solicitud_viaje', { requestId, tripId: trip.id, previo: current.datos, datos });
      return { status: 'aprobada', tripId: trip.id };
    }).catch(conflict);
  }

  @Post('businesses/:id/trips/:tripId/reassignment')
  @ApiBearerAuth()
  @input(reassignmentInput)
  async reassign(@Headers('authorization') header: string, @Param('id') id: string,
    @Param('tripId') trip: string, @Body() body: unknown) {
    const user = await actor(header);
    const negocio = parse(uuid, id);
    const viaje = parse(uuid, trip);
    const { userId, reason } = parse(reassignmentInput, body);
    return db.begin(async sql => {
      await access(sql, negocio, user.id, true, true);
      const [original] = await sql`select apertura,acuerdos,reference,customer,cerrado_en from campo.trips
        where business_id=${negocio} and id=${viaje} for update`;
      if (!original) throw new NotFoundException('Viaje no encontrado.');
      const [existente] = await sql`select id,status from campo.trip_requests where source_trip_id=${viaje}`;
      if (existente) return existente;
      if (original.cerrado_en) throw new ConflictException('El viaje ya está cerrado.');
      const [worker] = await sql`select user_id from campo.members where business_id=${negocio}
        and user_id=${userId} and role='encargado'`;
      if (!worker) throw new NotFoundException('Selecciona un encargado activo del negocio.');
      const { accion, ...acuerdos } = original.acuerdos ?? {};
      const datos = { ...acuerdos, ...original.apertura, customer: original.customer, reference: '' };
      const [request] = await sql`insert into campo.trip_requests (business_id,requester_id,datos,status,reason,source_trip_id)
        values (${negocio},${userId},${sql.json(datos)},'pendiente_correccion',${reason},${viaje}) returning id,status`;
      await sql`update campo.trips set reasignado_en=now() where id=${viaje}`;
      await audit(sql, negocio, user.id, 'reasignacion_viaje', { requestId: request.id, tripId: viaje, userId, reason });
      return request;
    }).catch(conflict);
  }

  @Get('businesses/:id/trip-requests/:requestId/source')
  @ApiBearerAuth()
  async requestSource(@Headers('authorization') header: string, @Param('id') id: string, @Param('requestId') request: string) {
    const user = await actor(header);
    const negocio = parse(uuid, id);
    const requestId = parse(uuid, request);
    return db.begin(async sql => {
      const { role } = await access(sql, negocio, user.id);
      const [source] = await sql`select t.id,t.reference from campo.trip_requests r
        join campo.trips t on t.business_id=r.business_id and t.id=r.source_trip_id
        where r.id=${requestId} and r.business_id=${negocio} and (${role !== 'encargado'} or r.requester_id=${user.id})`;
      if (!source) throw new NotFoundException('El viaje de origen no está disponible.');
      const data = await expediente(sql, source.id, false);
      return { reference: source.reference,
        compras: data.compras.map(({ folio, finca, kg }) => ({ folio, finca, kg })),
        ticket: data.ticketFabrica, entrega: data.entrega,
        gastos: role === 'encargado' ? gastosVisibles(data.gastos) : data.gastos,
        ...(role !== 'encargado' && { abonos: data.abonos }),
      };
    });
  }

  @Get('businesses/:id/trips/:tripId/operation')
  @ApiBearerAuth()
  async operation(@Headers('authorization') header: string, @Param('id') id: string, @Param('tripId') trip: string) {
    const user = await actor(header);
    const negocio = parse(uuid, id);
    const viaje = parse(uuid, trip);
    return db.begin(async sql => {
      const { role } = await access(sql, negocio, user.id);
      const actual = await this.verifyTrip(sql, negocio, viaje, user.id, role);
      if (!actual.acuerdos) throw new ConflictException('Completa los datos de apertura del viaje.');
      const result = await expediente(sql, viaje);
      const [asignado] = await sql`select u.email from campo.assignments a
        join auth.users u on u.id=a.user_id where a.trip_id=${viaje}
        order by u.email, a.user_id limit 1`;
      const beneficiario = role === 'encargado' ? user.email ?? '' : asignado?.email ?? '';
      return role === 'encargado' ? {
        beneficiario,
        sugerencias: result.sugerencias,
        gastos: gastosVisibles(result.gastos),
        resumen: { folio_compra: result.resumen.folio_compra, kg_pendientes: result.resumen.kg_pendientes,
          kg_comprados: result.resumen.kg_comprados, acuerdos: Boolean(result.resumen.acuerdos), cerrado_en: result.resumen.cerrado_en, reasignado_en: result.resumen.reasignado_en },
        compras: result.compras.map(({ id, folio, finca, kg }) => ({ id, folio, finca, kg })),
      } : { ...result, beneficiario };
    });
  }

  @Post('businesses/:id/trips/:tripId/operation')
  @ApiBearerAuth()
  @input(operacion)
  async addOperation(@Headers('authorization') header: string, @Param('id') id: string,
    @Param('tripId') trip: string, @Body() body: unknown) {
    const user = await actor(header);
    const negocio = parse(uuid, id);
    const viaje = parse(uuid, trip);
    const datos = parse(operacion, body);
    return db.begin(async sql => {
      const { role } = await access(sql, negocio, user.id, !['gasto', 'gastos'].includes(datos.accion));
      const actual = await this.verifyTrip(sql, negocio, viaje, user.id, role);
      if (!actual.acuerdos) throw new ConflictException('Completa los datos de apertura del viaje.');
      const cambios = await registrarOperacion(sql, viaje, negocio, datos, role);
      if (cambios && 'existente' in cambios) return { ok: true, ...cambios };
      await audit(sql, negocio, user.id, datos.accion, {
        tripId: viaje, reason: ('motivo' in datos ? datos.motivo : undefined) ?? '', cambios,
      });
      return { ok: true, ...cambios };
    }).catch(conflict);
  }

  private async verifyTrip(sql: Query, negocio: string, viaje: string, userId: string, role: string) {
    const [row] = await sql`select t.apertura,t.acuerdos,t.cerrado_en,t.reasignado_en from campo.trips t where t.business_id=${negocio} and t.id=${viaje}
      and (${role !== 'encargado'} or exists(select 1 from campo.assignments a
      where a.trip_id=t.id and a.user_id=${userId}))`;
    if (!row) throw new NotFoundException('Viaje no encontrado.');
    return row;
  }

  @Post('businesses/:id/trips/:tripId/assignments')
  @ApiBearerAuth()
  @input(assignmentInput)
  async assign(@Headers('authorization') header: string, @Param('id') id: string, @Param('tripId') trip: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const tripId = parse(uuid, trip);
    const { userId } = parse(assignmentInput, body);
    return db.begin(async sql => {
      await access(sql, businessId, user.id, true);
      const [created] = await sql`insert into campo.assignments (business_id,trip_id,user_id)
        select t.business_id,t.id,m.user_id from campo.trips t
        join campo.members m on m.business_id=t.business_id and m.user_id=${userId} and m.role='encargado'
        where t.business_id=${businessId} and t.id=${tripId} and t.reasignado_en is null returning user_id`;
      if (!created) throw new NotFoundException('El viaje y el encargado deben pertenecer al negocio.');
      await audit(sql, businessId, user.id, 'asignacion_viaje', { tripId,userId });
      return { ok: true };
    }).catch(conflict);
  }
}

@Module({ controllers: [CampoController] })
class CampoModule {}

async function bootstrap() {
  const app = await NestFactory.create(CampoModule);
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',') });
  app.enableShutdownHooks();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app,
    new DocumentBuilder().setTitle('ponitero').setVersion('0.1').addBearerAuth().build()));
  await app.listen(Number(process.env.PORT ?? 3001), '127.0.0.1');
}
void bootstrap();
