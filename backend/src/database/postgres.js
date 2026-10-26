import pg from 'pg';

const { Pool } = pg;

export function createPostgresDatabase(databaseConfig) {
  const pool = new Pool({
    ...databaseConfig,
    application_name: 'registro-asistencia-api',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return {
    async query(text, values) {
      return await pool.query(text, values);
    },

    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async ping() {
      await pool.query('SELECT 1');
    },

    async close() {
      await pool.end();
    },
  };
}
