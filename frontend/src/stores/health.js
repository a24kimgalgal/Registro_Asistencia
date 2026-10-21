import { defineStore } from 'pinia';

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api/v1';

export const useHealthStore = defineStore('health', {
  state: () => ({
    status: 'loading',
    message: 'Comprobando la conexión...',
  }),
  actions: {
    async check() {
      this.status = 'loading';
      this.message = 'Comprobando la conexión...';

      try {
        const response = await fetch(`${apiBaseUrl}/health`);
        const result = await response.json();

        if (response.ok && result.status === 'ok') {
          this.status = 'connected';
          this.message = 'La API y la base de datos están disponibles.';
          return;
        }

        if (result.database === 'unavailable') {
          this.status = 'unavailable';
          this.message = 'La API responde, pero la base de datos no está disponible.';
          return;
        }

        throw new Error('La API no está disponible.');
      } catch {
        this.status = 'unavailable';
        this.message = 'No se pudo conectar con la API. Comprueba que el servidor esté iniciado.';
      }
    },
  },
});
