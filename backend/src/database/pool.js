import pg from 'pg';

const { Pool } = pg;

export function createDatabasePool(databaseConfig) {
  return new Pool({
    ...databaseConfig,
    application_name: 'registro-asistencia-api',
  });
}
