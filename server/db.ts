import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolClient } from 'pg';
import * as schema from '../shared/schema';

// ✅ Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL is not defined in the .env file');
}

// ✅ Create connection pool with RLS-optimized settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_USE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ✅ Base drizzle instance
export const db = drizzle(pool, { schema });

// ✅ RLS-aware database context
export interface DatabaseContext {
  userId?: string;
  tenantId?: string;
  roles?: string[];
}

// ✅ Create an RLS-aware database connection
export async function createRLSConnection(context: DatabaseContext) {
  const client = await pool.connect();
  
  try {
    // Set RLS context variables for the session
    if (context.userId) {
      await client.query('SET LOCAL app.current_user_id = $1', [context.userId]);
    }
    
    if (context.tenantId) {
      await client.query('SET LOCAL app.current_tenant_id = $1', [context.tenantId]);
    }
    
    if (context.roles && context.roles.length > 0) {
      await client.query('SET LOCAL app.current_user_roles = $1', [context.roles.join(',')]);
    }
    
    // Create drizzle instance with this specific client
    return drizzle(client, { schema });
  } catch (error) {
    client.release();
    throw error;
  }
}

// ✅ Helper to execute queries with RLS context
export async function withRLSContext<T>(
  context: DatabaseContext,
  operation: (db: typeof schema & { $client: PoolClient }) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    // Set RLS context variables
    if (context.userId) {
      await client.query('SET LOCAL app.current_user_id = $1', [context.userId]);
    }
    
    if (context.tenantId) {
      await client.query('SET LOCAL app.current_tenant_id = $1', [context.tenantId]);
    }
    
    if (context.roles && context.roles.length > 0) {
      await client.query('SET LOCAL app.current_user_roles = $1', [context.roles.join(',')]);
    }
    
    // Create RLS-aware drizzle instance
    const rlsDb = drizzle(client, { schema });
    
    // Execute the operation
    return await operation(rlsDb as any);
  } finally {
    client.release();
  }
}

// ✅ Middleware helper for extracting user context from request
export function extractUserContext(req: any): DatabaseContext {
  return {
    userId: req.user?.id || req.userId,
    tenantId: req.user?.tenantId || req.tenantId,
    roles: req.user?.roles || [],
  };
}

// ✅ Type-safe query builder with automatic RLS context
export function createUserQuery(context: DatabaseContext) {
  return {
    async execute<T>(queryFn: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
      return withRLSContext(context, queryFn);
    }
  };
}

// ✅ Export pool for raw queries (use sparingly)
export { pool };

// ✅ Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Gracefully shutting down database connections...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Gracefully shutting down database connections...');
  await pool.end();
  process.exit(0);
});