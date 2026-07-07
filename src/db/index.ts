import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

export const createPool = () => {
  const dbUrl = process.env.DATABASE_URL;
  const isPostgresUrl = dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));
  if (isPostgresUrl) {
    const useSsl = dbUrl.includes('supabase.co') || dbUrl.includes('sslmode=');
    return new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 15000,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
  });
};

const pool = createPool();

pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

export const db = drizzle(pool, { schema });
