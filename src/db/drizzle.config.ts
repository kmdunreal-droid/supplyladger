import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

const dbUrl = process.env.DATABASE_URL;
const isPostgresUrl = dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));

if (!isPostgresUrl && (!sqlHost || !sqlDbName || !user || !password)) {
  console.warn("SQL environment variables are missing. Drizzle Kit might fail.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: isPostgresUrl
    ? { 
        url: dbUrl,
        ssl: dbUrl.includes('supabase.co') || dbUrl.includes('sslmode=') 
          ? { rejectUnauthorized: false } 
          : undefined
      }
    : {
        host: sqlHost || "",
        user: user || "",
        password: password || "",
        database: sqlDbName || "",
        ssl: false,
      },
  verbose: true,
  strict: true,
});
