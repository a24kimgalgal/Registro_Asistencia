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
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (url.endsWith('/health')) {
        return { ok: true, json: async () => ({ status: 'ok', database: 'connected' }) };
      }
      if (url.endsWith('/courses')) {
        return { ok: true, json: async () => ({ courses: [] }) };
      }
      return { ok: true, json: async () => ({ classes: [], schedule: [], subjects: [] }) };
    }));
  });

  it('shows an empty course state without sample attendance', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Selecciona o crea un curso');
    expect(wrapper.text()).toContain('Pendientes');
    expect(wrapper.text()).toContain('Falta');
    expect(wrapper.findAll('[role="columnheader"]')).toHaveLength(5);
    expect(wrapper.findAll('[role="gridcell"]').length % 5).toBe(0);
    expect(wrapper.text()).not.toContain('Matemáticas');

    wrapper.unmount();
  });

  it('navigates through twelve months and returns to the current month', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });
    const currentMonth = new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric',
    }).format(new Date()).replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase('es-ES'));

    const expectedMonth = (offset) => new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1))
      .replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase('es-ES'));

    for (let month = 0; month < 6; month += 1) {
      await wrapper.get('[aria-label="Mes anterior"]').trigger('click');
    }
    expect(wrapper.find('.month-title').text()).toBe(expectedMonth(-6));

    for (let month = 0; month < 11; month += 1) {
      await wrapper.get('[aria-label="Mes siguiente"]').trigger('click');
    }
    expect(wrapper.find('.month-title').text()).toBe(expectedMonth(5));
    expect(wrapper.get('[aria-label="Mes siguiente"]').attributes('disabled')).toBeDefined();

    await wrapper.findAll('button').find((button) => button.text().trim() === 'Hoy').trigger('click');
    expect(wrapper.find('.month-title').text()).toBe(currentMonth);

    wrapper.unmount();
  });

  it('shows the empty state for a course without subjects', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });

    await wrapper.findAll('button')
      .find((button) => button.text().trim() === 'Materias')
      .trigger('click');
    expect(wrapper.text()).toContain('Selecciona o crea un curso');
    expect(wrapper.text()).not.toContain('Resumen del mes');

    wrapper.unmount();
  });

  it('loads course classes and records a late arrival', async () => {
    const today = new Date();
    const classDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let attendanceStatus = 'pending';
    fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/health')) {
        return response({ status: 'ok', database: 'connected' });
      }
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '4',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: `${today.getFullYear()}-01-01`,
            endDate: `${today.getFullYear()}-12-31`,
            isCurrent: true,
          }],
        });
      }
      if (url.includes('/month?')) {
        return response({
          classes: [{
            scheduleEntryId: '12',
            classDate: `${classDate}T00:00:00.000Z`,
            subjectId: '5',
            subjectName: 'Programación',
            teacherName: 'Ana Pérez',
            startTime: '09:00:00',
            endTime: '10:00:00',
            status: attendanceStatus,
            arrivedAt: attendanceStatus === 'late' ? '09:12:00' : null,
            notes: null,
          }],
        });
      }
      if (url.includes('/attendance/') && options.method === 'PUT') {
        attendanceStatus = JSON.parse(options.body).status;
        return response({ attendance: { status: attendanceStatus } });
      }
      if (url.includes('/attendance/') && options.method === 'DELETE') {
        attendanceStatus = 'pending';
        return response({});
      }
      if (url.includes('/schedule?')) return response({ schedule: [] });
      if (url.endsWith('/subjects')) return response({ subjects: [] });
      return response({});
    });

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Programación');
    expect(wrapper.text()).toContain('Pendiente');
    await wrapper.get('.day-class-actions .admin-button').trigger('click');
    await wrapper.get('.attendance-form select').setValue('late');
    await wrapper.get('.attendance-form input[type="time"]').setValue('09:12');
    await wrapper.get('.attendance-form').trigger('submit');
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/schedule/12/attendance/${classDate}`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'late', arrivedAt: '09:12', notes: null }),
      }),
    );
    expect(wrapper.text()).toContain('Retardo');
    expect(wrapper.text()).toContain('Asistencia guardada: retardo.');

    await wrapper.get('.day-class-actions .admin-button--secondary').trigger('click');
    await flushPromises();
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/schedule/12/attendance/${classDate}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(wrapper.text()).toContain('Registro eliminado; la clase queda pendiente.');
    expect(wrapper.text()).toContain('Pendiente');
    wrapper.unmount();
  });

  it('shows the saved weekday schedule and course subjects', async () => {
    const today = new Date();
    const year = today.getFullYear();
    const classDate = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const weekday = ((today.getDay() + 6) % 7) + 1;
    fetch.mockImplementation(async (url) => {
      if (url.endsWith('/health')) return response({ status: 'ok', database: 'connected' });
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '4',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: `${year}-01-01`,
            endDate: `${year}-12-31`,
            isCurrent: true,
          }],
        });
      }
      if (url.includes('/month?')) {
        return response({
          classes: [{
            scheduleEntryId: '12',
            classDate,
            subjectId: '5',
            subjectName: 'Programación',
            teacherName: 'Ana Pérez',
            startTime: '09:00:00',
            endTime: '10:00:00',
            status: 'pending',
            arrivedAt: null,
            notes: null,
          }],
        });
      }
      if (url.includes('/schedule?')) {
        return response({
          schedule: [{
            id: '12',
            weekday,
            subjectName: 'Programación',
            teacherName: 'Ana Pérez',
            startTime: '09:00:00',
            endTime: '10:00:00',
          }],
        });
      }
      if (url.endsWith('/subjects')) {
        return response({ subjects: [{ id: '5', name: 'Programación', isActive: true, color: null }] });
      }
      return response({});
    });
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });
    await flushPromises();

    await wrapper.findAll('button')
      .find((button) => button.text().trim() === 'Marcar asistencia')
      .trigger('click');
    await flushPromises();
    expect(wrapper.find('#weekly-heading').text()).toBe('Horario semanal');
    expect(wrapper.get('input[type="date"]').element.value).toBe(classDate);

    expect(wrapper.findAll('.weekly-entry')).toHaveLength(1);
    expect(wrapper.text()).toContain('09:00–10:00');
    expect(wrapper.text()).toContain('Ana Pérez');
    expect(wrapper.findAll('.day-class-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('Clases del');
    expect(wrapper.find('.day-class-card').text()).toContain('Pendiente');

    await wrapper.findAll('.primary-nav button').find((button) => button.text().trim() === 'Materias').trigger('click');
    expect(wrapper.findAll('.subject-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('Programación');
    wrapper.unmount();
  });

  it('marks an individual class from the weekly schedule', async () => {
    const today = new Date();
    const classDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const weekday = ((today.getDay() + 6) % 7) + 1;
    let status = 'pending';
    fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/health')) return response({ status: 'ok', database: 'connected' });
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '4',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: `${today.getFullYear()}-01-01`,
            endDate: `${today.getFullYear()}-12-31`,
            isCurrent: true,
          }],
        });
      }
      if (url.includes('/month?')) {
        return response({
          classes: [{
            scheduleEntryId: '12',
            classDate,
            subjectId: '5',
            subjectName: 'Programación',
            teacherName: 'Ana Pérez',
            startTime: '09:00:00',
            endTime: '10:00:00',
            status,
            arrivedAt: null,
            notes: null,
          }],
        });
      }
      if (url.includes('/attendance/') && options.method === 'PUT') {
        status = JSON.parse(options.body).status;
        return response({ attendance: { status } });
      }
      if (url.includes('/schedule?')) {
        return response({
          schedule: [{
            id: '12',
            weekday,
            subjectName: 'Programación',
            teacherName: 'Ana Pérez',
            startTime: '09:00:00',
            endTime: '10:00:00',
          }],
        });
      }
      if (url.endsWith('/subjects')) return response({ subjects: [] });
      return response({});
    });
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });
    await flushPromises();
    await wrapper.findAll('.primary-nav button')
      .find((button) => button.text().trim() === 'Horario')
      .trigger('click');
    await wrapper.findAll('.quick-attendance-actions button')
      .find((button) => button.text().trim() === 'Falta')
      .trigger('click');
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/schedule/12/attendance/${classDate}`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'absent' }),
      }),
    );
    expect(wrapper.text()).toContain('Falta');
    expect(wrapper.findAll('.quick-attendance-actions button')
      .find((button) => button.text().trim() === 'Falta')
      .classes()).toContain('attendance-option--selected--absent');
    await wrapper.findAll('.quick-attendance-actions button')
      .find((button) => button.text().trim() === 'Retardo')
      .trigger('click');
    await wrapper.get('.attendance-form input[type="time"]').setValue('09:12');
    await wrapper.get('.attendance-form').trigger('submit');
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/schedule/12/attendance/${classDate}`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'late', arrivedAt: '09:12', notes: null }),
      }),
    );
    expect(wrapper.text()).toContain('Asistencia guardada: retardo.');
    await wrapper.findAll('.primary-nav button')
      .find((button) => button.text().trim() === 'Calendario')
      .trigger('click');
    await flushPromises();
    expect(wrapper.find('.summary-card--late .summary-value').text()).toBe('1');
    wrapper.unmount();
  });

  it('shows today by default and prevents changing future attendance', async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const classDate = dateKey(tomorrow);
    fetch.mockImplementation(async (url) => {
      if (url.endsWith('/health')) return response({ status: 'ok', database: 'connected' });
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '4',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: `${today.getFullYear()}-01-01`,
            endDate: `${today.getFullYear() + 1}-12-31`,
            isCurrent: true,
          }],
        });
      }
      if (url.includes('/month?')) {
        return response({
          classes: [{
            scheduleEntryId: '12',
            classDate,
            subjectId: '5',
            subjectName: 'Programación',
            teacherName: 'Ana Pérez',
            startTime: '09:00:00',
            endTime: '10:00:00',
            status: 'pending',
            arrivedAt: null,
            notes: null,
          }],
        });
      }
      if (url.includes('/schedule?')) return response({ schedule: [] });
      if (url.endsWith('/subjects')) return response({ subjects: [] });
      return response({});
    });

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), createVuetify()],
      },
    });
    await flushPromises();
    await wrapper.findAll('.primary-nav button')
      .find((button) => button.text().trim() === 'Horario')
      .trigger('click');
    await flushPromises();

    expect(wrapper.get('input[type="date"]').element.value).toBe(dateKey(today));
    await wrapper.get('input[type="date"]').setValue(classDate);
    await wrapper.get('input[type="date"]').trigger('change');
    await flushPromises();

    expect(wrapper.text()).toContain('la asistencia solo se puede cambiar hasta hoy');
    expect(wrapper.findAll('.quick-attendance-actions button').every((button) => button.element.disabled)).toBe(true);
    await wrapper.findAll('.quick-attendance-actions button')
      .find((button) => button.text().trim() === 'Presente')
      .trigger('click');
    expect(fetch.mock.calls.some(([url, options]) => url.includes('/attendance/') && options?.method === 'PUT')).toBe(false);
    wrapper.unmount();
  });
});

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
