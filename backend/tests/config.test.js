import { describe, expect, it } from '@jest/globals';
import { getConfig } from '../src/config.js';

describe('getConfig', () => {
  it('accepts a PostgreSQL URL for local backend development', () => {
    expect(getConfig({
      PORT: '3000',
      DATABASE_URL: 'postgresql://localhost/registro_asistencia',
    })).toEqual({
      port: 3000,
      databaseConfig: {
        connectionString: 'postgresql://localhost/registro_asistencia',
      },
    });
  });

  it('accepts PostgreSQL host settings for Docker Compose', () => {
    expect(getConfig({
      PGHOST: 'database',
      PGPORT: '5432',
      PGDATABASE: 'registro_asistencia',
      PGUSER: 'postgres',
      PGPASSWORD: 'local-password',
    })).toEqual({
      port: 3000,
      databaseConfig: {
        host: 'database',
        port: 5432,
        database: 'registro_asistencia',
        user: 'postgres',
        password: 'local-password',
      },
    });
  });

  it('requires a complete PostgreSQL connection configuration', () => {
    expect(() => getConfig({ PGHOST: 'database' })).toThrow(
      'Set DATABASE_URL or PGHOST, PGDATABASE, PGUSER, and PGPASSWORD',
    );
  });
});
