import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AdminPanel from '../src/components/AdminPanel.vue';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('administration panel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/courses') && options.method === 'POST') {
        return response({ course: { id: '1' } }, 201);
      }
      if (url.endsWith('/courses')) return response({ courses: [] });
      if (url.endsWith('/teachers')) return response({ teachers: [] });
      return response({ subjects: [], schedule: [] });
    }));
  });

  it('loads administration sections and creates a course through the API', async () => {
    const wrapper = mount(AdminPanel);
    await flushPromises();

    expect(wrapper.text()).toContain('Administración');
    expect(wrapper.text()).toContain('Crea uno para empezar');

    await wrapper.get('input[placeholder="2 DAW"]').setValue('2 DAW');
    await wrapper.get('input[placeholder="2026-2027"]').setValue('2026-2027');
    await wrapper.get('input[type="date"]').setValue('2026-09-01');
    const dateInputs = wrapper.findAll('input[type="date"]');
    await dateInputs[1].setValue('2027-06-30');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith('/api/v1/courses', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        name: '2 DAW',
        academicYear: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        isCurrent: false,
      }),
    }));
    expect(wrapper.text()).toContain('Curso creado.');

    wrapper.unmount();
  });

  it('shows the course and teacher selectors for weekly scheduling', async () => {
    const today = new Date();
    fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '2',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: `${today.getFullYear()}-01-01`,
            endDate: `${today.getFullYear() + 1}-06-30`,
            isCurrent: true,
          }],
        });
      }
      if (url.endsWith('/teachers')) {
        return response({ teachers: [{ id: '8', name: 'Carles Narvaez', isActive: true }] });
      }
      if (url.endsWith('/subjects')) {
        return response({ subjects: [{ id: '3', name: 'Programación', isActive: true }] });
      }
      if (url.includes('/courses/2/schedule') && options.method === 'POST') {
        return response({ scheduleEntry: { id: '10' } }, 201);
      }
      return response({
        schedule: [{
          id: '10',
          subjectId: '3',
          subjectName: 'Programación',
          teacherId: '8',
          teacherName: 'Carles Narvaez',
          weekday: 1,
          startTime: '08:00:00',
          endTime: '09:00:00',
          validFrom: '2026-09-01',
        }],
      });
    });
    const wrapper = mount(AdminPanel);
    await flushPromises();
    await wrapper.findAll('.admin-tabs button')[3].trigger('click');

    expect(wrapper.text()).toContain('Añadir clase semanal');
    expect(wrapper.text()).toContain('Profesor (opcional)');
    const selects = wrapper.findAll('.admin-form select');
    await selects[0].setValue('3');
    await selects[1].setValue('8');
    await selects[2].setValue('1');
    const timeInputs = wrapper.findAll('input[type="time"]');
    await timeInputs[0].setValue('08:00');
    await timeInputs[1].setValue('09:00');
    await wrapper.get('.admin-form').trigger('submit');
    await flushPromises();

    const scheduleRequest = fetch.mock.calls.find(
      ([url, options]) => url === '/api/v1/courses/2/schedule' && options.method === 'POST',
    );
    expect(JSON.parse(scheduleRequest[1].body)).toEqual({
      subjectId: 3,
      teacherId: 8,
      weekday: 1,
      startTime: '08:00',
      endTime: '09:00',
    });
    expect(wrapper.text()).toContain('desde el inicio del curso');
    expect(wrapper.text()).not.toContain('Vigente desde');
    expect(wrapper.text()).toContain('Lunes · 08:00–09:00');
    expect(wrapper.text()).toContain('Programación · Carles Narvaez');
    expect(wrapper.text()).toContain('Clase añadida al horario.');
    wrapper.unmount();
  });

  it('leaves schedule validity to the backend for a future course', async () => {
    fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '2',
            name: 'Curso futuro',
            academicYear: '2099-2100',
            startDate: '2099-09-01',
            endDate: '2100-06-30',
            isCurrent: true,
          }],
        });
      }
      if (url.endsWith('/teachers')) return response({ teachers: [] });
      if (url.endsWith('/subjects')) {
        return response({ subjects: [{ id: '3', name: 'Programación', isActive: true }] });
      }
      if (url === '/api/v1/courses/2/schedule' && options.method === 'POST') {
        return response({ scheduleEntry: { id: '10' } }, 201);
      }
      return response({ schedule: [] });
    });
    const wrapper = mount(AdminPanel);
    await flushPromises();
    await wrapper.findAll('.admin-tabs button')[3].trigger('click');
    const selects = wrapper.findAll('.admin-form select');
    await selects[0].setValue('3');
    await wrapper.get('.admin-form').trigger('submit');
    await flushPromises();

    const scheduleRequest = fetch.mock.calls.find(
      ([url, options]) => url === '/api/v1/courses/2/schedule' && options.method === 'POST',
    );
    expect(JSON.parse(scheduleRequest[1].body)).not.toHaveProperty('validFrom');
    wrapper.unmount();
  });

  it('loads the selected course schedule within that course date range', async () => {
    fetch.mockImplementation(async (url) => {
      if (url.endsWith('/courses')) {
        return response({
          courses: [
            {
              id: '2',
              name: 'Curso anterior',
              academicYear: '1999-2000',
              startDate: '1999-09-01',
              endDate: '2000-06-30',
              isCurrent: false,
            },
            {
              id: '3',
              name: 'Curso nuevo',
              academicYear: '2099-2100',
              startDate: '2099-09-01',
              endDate: '2100-06-30',
              isCurrent: true,
            },
          ],
        });
      }
      if (url.endsWith('/teachers')) return response({ teachers: [] });
      if (url.includes('/subjects')) return response({ subjects: [] });
      return response({ schedule: [] });
    });
    const wrapper = mount(AdminPanel, { props: { selectedCourseId: '2' } });
    await flushPromises();

    await wrapper.setProps({ selectedCourseId: '3' });
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/courses/3/schedule?date=2099-09-01',
      expect.objectContaining({ headers: {} }),
    );
    wrapper.unmount();
  });

  it('closes a schedule entry automatically after its attendance history', async () => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const lastAttendance = new Date(today);
    lastAttendance.setDate(today.getDate() - 1);
    const lastAttendanceKey = `${lastAttendance.getFullYear()}-${String(lastAttendance.getMonth() + 1).padStart(2, '0')}-${String(lastAttendance.getDate()).padStart(2, '0')}`;
    fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '2',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: todayKey,
            endDate: `${today.getFullYear() + 1}-06-30`,
            isCurrent: true,
          }],
        });
      }
      if (url.endsWith('/teachers')) return response({ teachers: [] });
      if (url.endsWith('/subjects')) return response({ subjects: [] });
      if (url.includes('/schedule/10') && options.method === 'DELETE') {
        return response({}, 204);
      }
      if (url.includes('/schedule?')) {
        return response({
          schedule: [{
            id: '10',
            subjectId: '3',
            subjectName: 'Programación',
            weekday: 1,
            startTime: '09:00:00',
            endTime: '10:00:00',
            validFrom: `${todayKey}T00:00:00.000Z`,
            validUntil: null,
            lastAttendanceDate: `${lastAttendanceKey}T00:00:00.000Z`,
          }],
        });
      }
      return response({ schedule: [] });
    });
    const wrapper = mount(AdminPanel);
    await flushPromises();
    await wrapper.findAll('.admin-tabs button')[3].trigger('click');
    await wrapper.findAll('.admin-text-button')
      .find((button) => button.text().trim() === 'Cerrar horario')
      .trigger('click');
    await flushPromises();

    const closeRequest = fetch.mock.calls.find(
      ([url, options]) => url === '/api/v1/schedule/10' && options.method === 'DELETE',
    );
    const validUntil = JSON.parse(closeRequest[1].body).validUntil;
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + 1);
    const expectedDate = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
    expect(validUntil).toBe(expectedDate);
    expect(wrapper.text()).toContain(`Horario cerrado desde ${expectedDate}; el historial se conserva.`);
    wrapper.unmount();
  });

  it('permanently deletes a schedule entry through the explicit endpoint', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '2',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: `${today.getFullYear()}-01-01`,
            endDate: `${today.getFullYear() + 1}-06-30`,
            isCurrent: true,
          }],
        });
      }
      if (url.endsWith('/teachers')) return response({ teachers: [] });
      if (url.endsWith('/subjects')) return response({ subjects: [] });
      if (url === '/api/v1/courses/2/schedule?date=' + todayKey) {
        return response({
          schedule: [{
            id: '10',
            subjectId: '3',
            subjectName: 'Programación',
            weekday: 1,
            startTime: '09:00:00',
            endTime: '10:00:00',
          }],
        });
      }
      if (url === '/api/v1/schedule/10/permanent' && options.method === 'DELETE') {
        return response({}, 204);
      }
      return response({ schedule: [] });
    });
    const wrapper = mount(AdminPanel);
    await flushPromises();
    await wrapper.findAll('.admin-tabs button')[3].trigger('click');
    await wrapper.findAll('.admin-text-button')
      .find((button) => button.text().trim() === 'Borrar')
      .trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/schedule/10/permanent',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(wrapper.text()).toContain('Asignación borrada.');
    wrapper.unmount();
    confirm.mockRestore();
  });

  it('explains when a schedule entry cannot be deleted because it has attendance', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '2',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: `${today.getFullYear()}-01-01`,
            endDate: `${today.getFullYear() + 1}-06-30`,
            isCurrent: true,
          }],
        });
      }
      if (url.endsWith('/teachers')) return response({ teachers: [] });
      if (url.endsWith('/subjects')) return response({ subjects: [] });
      if (url.includes('/schedule?')) {
        return response({
          schedule: [{
            id: '10',
            subjectId: '3',
            subjectName: 'Programación',
            weekday: 1,
            startTime: '09:00:00',
            endTime: '10:00:00',
          }],
        });
      }
      if (url === '/api/v1/schedule/10/permanent' && options.method === 'DELETE') {
        return response({
          error: {
            code: 'SCHEDULE_ENTRY_HAS_ATTENDANCE',
            message: 'This schedule entry has attendance records and cannot be deleted.',
          },
        }, 409);
      }
      return response({ schedule: [] });
    });
    const wrapper = mount(AdminPanel);
    await flushPromises();
    await wrapper.findAll('.admin-tabs button')[3].trigger('click');
    await wrapper.findAll('.admin-text-button')
      .find((button) => button.text().trim() === 'Borrar')
      .trigger('click');
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/schedule/10/permanent',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(wrapper.text()).toContain(
      'No se puede borrar esta asignación porque tiene asistencias. Puedes cerrarla para conservar el historial.',
    );
    wrapper.unmount();
    vi.restoreAllMocks();
  });

  it('shows an automatic effective date when editing a schedule entry', async () => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    fetch.mockImplementation(async (url) => {
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '2',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: todayKey,
            endDate: `${today.getFullYear() + 1}-06-30`,
            isCurrent: true,
          }],
        });
      }
      if (url.endsWith('/teachers')) return response({ teachers: [] });
      if (url.endsWith('/subjects')) return response({ subjects: [{ id: '3', name: 'Programación', isActive: true }] });
      if (url.includes('/schedule?')) {
        return response({
          schedule: [{
            id: '10',
            subjectId: '3',
            subjectName: 'Programación',
            weekday: 1,
            startTime: '09:00:00',
            endTime: '10:00:00',
            validFrom: `${todayKey}T00:00:00.000Z`,
            lastAttendanceDate: `${todayKey}T00:00:00.000Z`,
          }],
        });
      }
      return response({ schedule: [] });
    });
    const wrapper = mount(AdminPanel);
    await flushPromises();
    await wrapper.findAll('.admin-tabs button')[3].trigger('click');
    await wrapper.find('.admin-text-button').trigger('click');

    expect(wrapper.text()).toContain(
      'El cambio se aplicará automáticamente desde el día siguiente a hoy o a la última asistencia.',
    );
    expect(wrapper.findAll('input[type="date"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('deletes an unused subject from the administration screen', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '2',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: '2026-09-01',
            endDate: '2027-06-30',
            isCurrent: true,
          }],
        });
      }
      if (url.endsWith('/teachers')) return response({ teachers: [] });
      if (url === '/api/v1/subjects/5' && options.method === 'DELETE') {
        return response({ action: 'deleted' });
      }
      if (url.endsWith('/subjects')) {
        return response({
          subjects: [{ id: '5', name: 'Materia equivocada', isActive: true }],
        });
      }
      return response({ schedule: [] });
    });
    const wrapper = mount(AdminPanel);
    await flushPromises();
    await wrapper.findAll('.admin-tabs button')[1].trigger('click');
    await wrapper.find('.admin-text-button--danger').trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/subjects/5',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(wrapper.text()).toContain('Materia eliminada.');
    wrapper.unmount();
    confirm.mockRestore();
  });

  it('explains when a used subject is deactivated instead of deleted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '2',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: '2026-09-01',
            endDate: '2027-06-30',
            isCurrent: true,
          }],
        });
      }
      if (url.endsWith('/teachers')) return response({ teachers: [] });
      if (url === '/api/v1/subjects/5' && options.method === 'DELETE') {
        return response({ action: 'deactivated' });
      }
      if (url.endsWith('/subjects')) {
        return response({
          subjects: [{ id: '5', name: 'Programación', isActive: true }],
        });
      }
      return response({ schedule: [] });
    });
    const wrapper = mount(AdminPanel);
    await flushPromises();
    await wrapper.findAll('.admin-tabs button')[1].trigger('click');
    await wrapper.find('.admin-text-button--danger').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Materia desactivada para conservar el historial.');
    wrapper.unmount();
    vi.restoreAllMocks();
  });
});
