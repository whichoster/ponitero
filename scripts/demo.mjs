import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const url = new URL(process.env.SUPABASE_URL);
const database = new URL(process.env.DATABASE_URL);
const localHosts = ['localhost', '127.0.0.1'];
if (![url, database].every(item => localHosts.includes(item.hostname))) {
  throw new Error('Los datos de demostración se cargan solo en el entorno local.');
}
const { admin } = createClient(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth;
const sql = postgres(database.href);

async function account(email) {
  const [existing] = await sql`select id from auth.users where email=${email}`;
  if (existing) return existing.id;
  const { data, error } = await admin.createUser({ email, password: 'CampoDemo2026!', email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

try {
  const platformAdmin = await account('super@campo.test');
  await sql`insert into campo.platform_admins values (${platformAdmin}) on conflict do nothing`;
  for (const [key, name] of [['a', 'Piñas del Sur'], ['b', 'Fruta de la Costa']]) {
    const owner = await account('admin.' + key + '@campo.test');
    const worker = await account('encargado.' + key + '@campo.test');
    await sql.begin(async tx => {
      let [business] = await tx`select id from campo.businesses where owner_id=${owner} and deleted_at is null`;
      if (!business) {
        [business] = await tx`insert into campo.businesses (name,owner_id,status)
          values (${name},${owner},'aprobado') returning id`;
      }
      const { id } = business;
      await tx`insert into campo.members (business_id,user_id,role,can_manage_workers)
        values (${id},${owner},'administrador',true),(${id},${worker},'encargado',false)
        on conflict do nothing`;
      await tx`select id from campo.businesses where id=${id} for update`;
      for (const number of [1, 2]) {
        const reference = 'DEMO-' + key.toUpperCase() + '-' + number;
        await tx`insert into campo.trips (business_id,reference,customer)
          select ${id},${reference},'Sabormex'
          where not exists (select 1 from campo.trips where business_id=${id} and reference=${reference})`;
        if (number === 1) {
          const [trip] = await tx`select id from campo.trips where business_id=${id} and reference=${reference}`;
          await tx`insert into campo.assignments values (${id},${trip.id},${worker}) on conflict do nothing`;
        }
      }
    });
  }
  console.log('Dos negocios y cinco cuentas de demostración disponibles.');
} finally {
  await sql.end();
}
