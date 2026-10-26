import 'dotenv/config';
import { createApp } from './app.js';
import { getConfig } from './config.js';
import { createPostgresDatabase } from './database/postgres.js';
import { createPostgresRepositories } from './repositories/postgres.js';

const logger = console;
let server;
let shuttingDown = false;

async function start() {
  const config = getConfig();
  const database = createPostgresDatabase(config.databaseConfig);

  try {
    await database.ping();
  } catch (error) {
    logger.error('Could not connect to PostgreSQL. Check DATABASE_URL and database availability.', error);
    await database.close();
    process.exitCode = 1;
    return;
  }

  const repositories = createPostgresRepositories(database);
  const app = createApp({ repositories, logger });

  server = app.listen(config.port, () => {
    logger.info(`API listening on port ${config.port}`);
  });

  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(`Received ${signal}; shutting down.`);

    server.close((error) => {
      if (error) {
        logger.error('Failed to close the HTTP server cleanly.', error);
        process.exitCode = 1;
      }

      database.close().catch((databaseError) => {
        logger.error('Failed to close the PostgreSQL connection pool.', databaseError);
        process.exitCode = 1;
      });
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  logger.error('API startup failed.', error);
  process.exitCode = 1;
});
