import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

const globalForDrizzle = globalThis as unknown as { db: ReturnType<typeof drizzle> };

function createDb() {
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL!,
    waitForConnections: true,
    connectionLimit: 10,
  });
  return drizzle(pool, { schema, mode: 'default' });
}

export const db = globalForDrizzle.db ?? createDb();

if (process.env.NODE_ENV !== 'production') globalForDrizzle.db = db;
