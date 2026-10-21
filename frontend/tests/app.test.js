import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';
import App from '../src/App.vue';

describe('initial calendar screen', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', database: 'connected' }),
    }));
  });

  it('shows an empty course state without sample attendance', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Sin curso seleccionado');
    expect(wrapper.text()).toContain('No se muestran clases ni asistencias de ejemplo.');
    expect(wrapper.text()).toContain('Pendientes');
    expect(wrapper.text()).toContain('Falta');
    expect(wrapper.findAll('[role="columnheader"]')).toHaveLength(5);
    expect(wrapper.findAll('[role="gridcell"]').length % 5).toBe(0);
    expect(wrapper.text()).not.toContain('Matemáticas');

    wrapper.unmount();
  });

  it('navigates between months and returns to the current month', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });
    const currentMonth = new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric',
    }).format(new Date()).replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase('es-ES'));

    await wrapper.get('[aria-label="Mes anterior"]').trigger('click');
    expect(wrapper.find('.month-title').text()).not.toBe(currentMonth);

    await wrapper.findAll('button')
      .find((button) => button.text().trim() === 'Hoy')
      .trigger('click');
    expect(wrapper.find('.month-title').text()).toBe(currentMonth);

    wrapper.unmount();
  });

  it('shows a clear placeholder for sections without implemented data', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });

    await wrapper.findAll('button')
      .find((button) => button.text().trim() === 'Materias')
      .trigger('click');
    expect(wrapper.text()).toContain('Esta sección estará disponible');
    expect(wrapper.text()).not.toContain('Resumen del mes');

    wrapper.unmount();
  });
});
