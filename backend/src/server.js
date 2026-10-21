import 'dotenv/config';
import { createApp } from './app.js';
import { getConfig } from './config.js';
import { createDatabasePool } from './database/pool.js';

const logger = console;
let server;
let shuttingDown = false;

async function start() {
  const config = getConfig();
  const database = createDatabasePool(config.databaseConfig);

  try {
    await database.query('SELECT 1');
  } catch (error) {
    logger.error('Could not connect to PostgreSQL. Check DATABASE_URL and database availability.', error);
    await database.end();
    process.exitCode = 1;
    return;
  }

  const app = createApp({ database, logger });

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

      database.end().catch((databaseError) => {
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
