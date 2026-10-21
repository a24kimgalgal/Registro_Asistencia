import express from 'express';
import { createHealthRouter } from './routes/health.routes.js';

export function createApp({ database, logger = console }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1/health', createHealthRouter({ database, logger }));

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    });
  });

  app.use((error, req, res, next) => {
    logger.error('Unhandled request error', error);

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
  });

  return app;
}
