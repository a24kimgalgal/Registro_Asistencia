import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  test('confirms the database connection', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    };
    const app = createApp({ database });

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      database: 'connected',
    });
    expect(database.query).toHaveBeenCalledWith('SELECT 1');
  });

  test('reports an unavailable database without exposing internal errors', async () => {
    const logger = { error: jest.fn() };
    const database = {
      query: jest.fn().mockRejectedValue(new Error('sensitive connection detail')),
    };
    const app = createApp({ database, logger });

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      database: 'unavailable',
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('API fallback routes', () => {
  test('returns a JSON 404 for routes not implemented yet', async () => {
    const app = createApp({ database: { query: jest.fn() } });

    const response = await request(app).get('/api/v1/not-implemented');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
