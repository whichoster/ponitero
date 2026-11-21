import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const result = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }));
const publicKey = result.PUBLISHABLE_KEY ?? result.ANON_KEY;
const serviceKey = result.SECRET_KEY ?? result.SERVICE_ROLE_KEY;
if (!result.API_URL || !result.DB_URL || !publicKey || !serviceKey) {
  throw new Error('Ejecuta npm run db:start antes de configurar la API.');
}
writeFileSync('api/.env', [
  'SUPABASE_URL=' + result.API_URL,
  'SUPABASE_PUBLIC_KEY=' + publicKey,
  'SUPABASE_SERVICE_ROLE_KEY=' + serviceKey,
  'DATABASE_URL=' + result.DB_URL,
  'WEB_ORIGIN=http://localhost:3000',
  'PORT=3001',
  '',
].join('\n'), { flag: 'wx', mode: 0o600 });
console.log('Configuración local guardada en api/.env.');
