import 'reflect-metadata';
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Headers, HttpCode, Module, NotFoundException, Param, Patch, Post, UnauthorizedException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiBearerAuth, ApiBody, DocumentBuilder, SwaggerModule, type SchemaObject } from '@nestjs/swagger';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { z } from 'zod';
import { expediente, operacion, registrarOperacion } from './operacion';

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
const statusInput = z.object({ status: z.enum(['aprobado', 'suspendido']), reason: z.string().trim().min(3).max(300) });
const memberInput = z.object({ email });
const tripInput = z.object({ reference: z.string().trim().min(1).max(50), customer: z.string().trim().min(2).max(100) });
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

async function access(sql: Query, businessId: string, userId: string, write = false) {
  const superAdmin = await isSuper(sql, userId);
  const [row] = await sql`select b.status, m.role from campo.businesses b
    left join campo.members m on m.business_id=b.id and m.user_id=${userId}
    where b.id=${businessId} for share of b`;
  if (!row || (!superAdmin && !row.role)) throw new NotFoundException('Negocio no encontrado.');
  if (!superAdmin && row.status !== 'aprobado') throw new ForbiddenException('El negocio requiere aprobación.');
  if (write && !superAdmin && row.role !== 'administrador') throw new ForbiddenException('Operación reservada al administrador.');
  return superAdmin ? 'superadministrador' : row.role;
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
      where ${superAdmin} or m.user_id is not null order by b.created_at desc`;
    return {
      email: user.email, superAdmin,
      canRegisterBusiness: !superAdmin && !rows.some(item => item.role === 'administrador'),
      businesses: rows.map(item => ({
        ...item,
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
      await sql`insert into campo.members values (${business.id},${user.id},'administrador')`;
      await audit(sql, business.id, user.id, 'registro', { name });
      return business;
    }).catch(conflict);
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
      const [current] = await sql`select status from campo.businesses where id=${businessId} for update`;
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

  @Get('businesses/:id')
  @ApiBearerAuth()
  async details(@Headers('authorization') header: string, @Param('id') id: string) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    return db.begin(async sql => {
      const role = await access(sql, businessId, user.id);
      const canManageTrips = role !== 'encargado';
      const trips = await sql`select t.id,t.reference,t.customer,
        case when ${canManageTrips} then
          array(select a.user_id from campo.assignments a where a.trip_id=t.id order by a.user_id)
        else array[]::uuid[] end assigned
        from campo.trips t where t.business_id=${businessId} and
        (${canManageTrips} or exists (
          select 1 from campo.assignments a where a.trip_id=t.id and a.user_id=${user.id}
        )) order by t.created_at desc`;
      const members = canManageTrips ? await sql`select m.user_id,u.email from campo.members m
        join auth.users u on u.id=m.user_id where m.business_id=${businessId} and m.role='encargado' order by u.email` : [];
      const history = canManageTrips ? await sql`select a.id,a.action,a.details,a.created_at,u.email
        from campo.audit a join auth.users u on u.id=a.actor_id
        where a.business_id=${businessId} order by a.id desc limit 50` : [];
      return { role, canManageTrips, trips, members, history };
    });
  }

  @Post('businesses/:id/members')
  @ApiBearerAuth()
  @input(memberInput)
  async member(@Headers('authorization') header: string, @Param('id') id: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const { email } = parse(memberInput, body);
    return db.begin(async sql => {
      await access(sql, businessId, user.id, true);
      const [account] = await sql`select id,email from auth.users
        where lower(email)=lower(${email}) and email_confirmed_at is not null`;
      if (!account) throw new NotFoundException('La persona debe crear y confirmar su cuenta primero.');
      await sql`insert into campo.members values (${businessId},${account.id},'encargado')`;
      await audit(sql, businessId, user.id, 'alta_encargado', { userId: account.id, email: account.email });
      return account;
    }).catch(conflict);
  }

  @Post('businesses/:id/trips')
  @ApiBearerAuth()
  @input(tripInput)
  async trip(@Headers('authorization') header: string, @Param('id') id: string, @Body() body: unknown) {
    const user = await actor(header);
    const businessId = parse(uuid, id);
    const { reference, customer } = parse(tripInput, body);
    return db.begin(async sql => {
      await access(sql, businessId, user.id, true);
      const [trip] = await sql`insert into campo.trips (business_id,reference,customer)
        values (${businessId},${reference},${customer}) returning id,reference,customer`;
      await audit(sql, businessId, user.id, 'alta_viaje', { tripId: trip.id, reference });
      return trip;
    }).catch(conflict);
  }

  @Get('businesses/:id/trips/:tripId/operation')
  @ApiBearerAuth()
  async operation(@Headers('authorization') header: string, @Param('id') id: string, @Param('tripId') trip: string) {
    const user = await actor(header);
    const negocio = parse(uuid, id);
    const viaje = parse(uuid, trip);
    return db.begin(async sql => {
      const role = await access(sql, negocio, user.id);
      await this.verifyTrip(sql, negocio, viaje, user.id, role);
      const result = await expediente(sql, viaje);
      return role === 'encargado' ? {
        resumen: { acuerdos: Boolean(result.resumen.acuerdos), cerrado_en: result.resumen.cerrado_en },
        compras: result.compras.map(({ id, folio, finca, kg }) => ({ id, folio, finca, kg })),
      } : result;
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
      const role = await access(sql, negocio, user.id, datos.accion !== 'gasto');
      await this.verifyTrip(sql, negocio, viaje, user.id, role);
      const cambios = await registrarOperacion(sql, viaje, negocio, datos, role);
      await audit(sql, negocio, user.id, datos.accion, {
        tripId: viaje, reason: ('motivo' in datos ? datos.motivo : undefined) ?? '', cambios,
      });
      return { ok: true };
    }).catch(conflict);
  }

  private async verifyTrip(sql: Query, negocio: string, viaje: string, userId: string, role: string) {
    const [row] = await sql`select 1 from campo.trips t where t.business_id=${negocio} and t.id=${viaje}
      and (${role !== 'encargado'} or exists(select 1 from campo.assignments a
      where a.trip_id=t.id and a.user_id=${userId}))`;
    if (!row) throw new NotFoundException('Viaje no encontrado.');
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
        where t.business_id=${businessId} and t.id=${tripId} returning user_id`;
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
