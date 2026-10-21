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
    await wrapper.get('.admin-form input[type="date"]').setValue('2026-09-01');
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
      validFrom: '2026-09-01',
    });
    expect(wrapper.text()).toContain('Lunes · 08:00–09:00');
    expect(wrapper.text()).toContain('Programación · Carles Narvaez');
    expect(wrapper.text()).toContain('Clase añadida al horario.');
    wrapper.unmount();
  });
});
