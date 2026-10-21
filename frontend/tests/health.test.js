import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useHealthStore } from '../src/stores/health.js';

describe('health store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('marks the API and database as connected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', database: 'connected' }),
    }));
    const health = useHealthStore();

    await health.check();

    expect(fetch).toHaveBeenCalledWith('/api/v1/health');
    expect(health.status).toBe('connected');
    expect(health.message).toContain('disponibles');
  });

  it('reports when the API is reachable but the database is not', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'unavailable', database: 'unavailable' }),
    }));
    const health = useHealthStore();

    await health.check();

    expect(health.status).toBe('unavailable');
    expect(health.message).toContain('la base de datos');
  });

  it('shows a helpful message when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const health = useHealthStore();

    await health.check();

    expect(health.status).toBe('unavailable');
    expect(health.message).toContain('API');
  });
});
