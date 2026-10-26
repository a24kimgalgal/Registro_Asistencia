import { Router } from 'express';

export function createHealthRouter({ repositories, logger = console }) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      await repositories.health.check();
      return res.status(200).json({
        status: 'ok',
        database: 'connected',
      });
    } catch (error) {
      logger.error('Database health check failed', error);
      return res.status(503).json({
        status: 'unavailable',
        database: 'unavailable',
      });
    }
  });

  return router;
}
