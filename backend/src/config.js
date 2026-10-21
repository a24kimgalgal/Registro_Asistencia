export function getConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  const postgresPort = Number(env.PGPORT ?? 5432);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const hasDatabaseUrl = Boolean(env.DATABASE_URL);
  const hasPostgresConfig = [
    env.PGHOST,
    env.PGDATABASE,
    env.PGUSER,
    env.PGPASSWORD,
  ].every(Boolean);

  if (!hasDatabaseUrl && !hasPostgresConfig) {
    throw new Error(
      'Set DATABASE_URL or PGHOST, PGDATABASE, PGUSER, and PGPASSWORD to connect to PostgreSQL.',
    );
  }

  if (!Number.isInteger(postgresPort) || postgresPort < 1 || postgresPort > 65535) {
    throw new Error('PGPORT must be an integer between 1 and 65535.');
  }

  return {
    databaseConfig: hasDatabaseUrl
      ? { connectionString: env.DATABASE_URL }
      : {
          host: env.PGHOST,
          port: postgresPort,
          database: env.PGDATABASE,
          user: env.PGUSER,
          password: env.PGPASSWORD,
        },
    port,
  };
}
