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

  it('visually identifies today and future dates in the calendar', async () => {
    const today = new Date();
    const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const todayKey = dateKey(today);
    const nextWeekday = new Date(today);
    do {
      nextWeekday.setDate(nextWeekday.getDate() + 1);
    } while (nextWeekday.getDay() === 0 || nextWeekday.getDay() === 6);
    const futureKey = dateKey(nextWeekday);
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
      if (url.includes('/month?')) return response({ classes: [] });
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

    expect(wrapper.find('.calendar-date-legend').text()).toContain('Día pasado');
    expect(wrapper.find('.calendar-date-legend').text()).toContain('Hoy');
    expect(wrapper.find('.calendar-date-legend').text()).toContain('Fecha futura · solo consulta');
    const futureButton = wrapper.findAll('.calendar-day-button')
      .find((button) => button.get('time').attributes('datetime') === futureKey);
    expect(futureButton.classes()).toContain('calendar-day-button--future');
    expect(futureButton.element.parentElement.getAttribute('aria-label'))
      .toContain('fecha futura, solo consulta');
    await futureButton.trigger('click');
    expect(wrapper.find('.day-classes').text()).toContain('Puedes consultar este día');
    expect(wrapper.find('.day-classes').text()).toContain('la asistencia solo se puede cambiar hasta hoy');

    if (today.getDay() !== 0 && today.getDay() !== 6) {
      const todayButton = wrapper.findAll('.calendar-day-button')
        .find((button) => button.get('time').attributes('datetime') === todayKey);
      expect(todayButton.classes()).toContain('calendar-day-button--today');
      expect(todayButton.element.parentElement.getAttribute('aria-label')).toContain('hoy');
    }
    const previousWeekday = new Date(today);
    do {
      previousWeekday.setDate(previousWeekday.getDate() - 1);
    } while (previousWeekday.getDay() === 0 || previousWeekday.getDay() === 6);
    if (previousWeekday.getMonth() === today.getMonth()) {
      const pastButton = wrapper.findAll('.calendar-day-button')
        .find((button) => button.get('time').attributes('datetime') === dateKey(previousWeekday));
      expect(pastButton.classes()).toContain('calendar-day-button--past');
    }
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

  it('shows past classes across the full course period for attendance', async () => {
    const today = new Date();
    const monthAt = (offset) => new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const courseStart = monthAt(-20);
    courseStart.setDate(15);
    const courseEnd = new Date(today.getFullYear(), today.getMonth() + 6, 0);
    const pastClassDate = new Date(today.getFullYear(), today.getMonth() - 15, 15);
    const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const expectedMonth = (date) => new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric',
    }).format(date).replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase('es-ES'));
    const pastDate = dateKey(pastClassDate);
    const course = {
      id: '4',
      name: 'Curso largo',
      academicYear: '2024-2027',
      startDate: `${dateKey(courseStart)}T00:00:00.000Z`,
      endDate: `${dateKey(courseEnd)}T00:00:00.000Z`,
      isCurrent: true,
    };
    fetch.mockImplementation(async (url) => {
      if (url.endsWith('/health')) return response({ status: 'ok', database: 'connected' });
      if (url.endsWith('/courses')) return response({ courses: [course] });
      if (url.includes('/month?')) {
        return response({
          classes: [{
            scheduleEntryId: '12',
            classDate: pastDate,
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
    expect(wrapper.get('[aria-label="Mes anterior"]').element.disabled).toBe(false);
    expect(wrapper.get('[aria-label="Mes siguiente"]').element.disabled).toBe(false);

    for (let month = 0; month < 15; month += 1) {
      await wrapper.get('[aria-label="Mes anterior"]').trigger('click');
      await flushPromises();
    }
    expect(wrapper.find('.month-title').text()).toBe(expectedMonth(pastClassDate));

    for (let month = 0; month < 5; month += 1) {
      await wrapper.get('[aria-label="Mes anterior"]').trigger('click');
      await flushPromises();
    }
    expect(wrapper.find('.month-title').text()).toBe(expectedMonth(courseStart));
    expect(wrapper.get('[aria-label="Mes anterior"]').element.disabled).toBe(true);
    const dateBeforeCourse = wrapper.findAll('.calendar-day-button')
      .find((button) => button.get('time').attributes('datetime') < course.startDate);
    expect(dateBeforeCourse.element.disabled).toBe(true);

    for (let month = 0; month < 5; month += 1) {
      await wrapper.get('[aria-label="Mes siguiente"]').trigger('click');
      await flushPromises();
    }
    expect(wrapper.find('.month-title').text()).toBe(expectedMonth(pastClassDate));

    await wrapper.findAll('.primary-nav button')
      .find((button) => button.text().trim() === 'Horario')
      .trigger('click');
    await flushPromises();
    const dateInput = wrapper.get('input[type="date"]');
    expect(dateInput.attributes('min')).toBe(course.startDate.slice(0, 10));
    expect(dateInput.attributes('max')).toBe(course.endDate.slice(0, 10));
    await dateInput.setValue(pastDate);
    await dateInput.trigger('change');
    await flushPromises();

    expect(wrapper.find('.day-class-card').text()).toContain('Programación');
    expect(wrapper.findAll('.quick-attendance-actions button')).toHaveLength(3);
    expect(wrapper.findAll('.quick-attendance-actions button').every((button) => !button.element.disabled)).toBe(true);
    expect(fetch.mock.calls.some(([url]) => url.includes(`/month?year=${pastClassDate.getFullYear()}&month=${String(pastClassDate.getMonth() + 1).padStart(2, '0')}`))).toBe(true);

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
    expect(wrapper.find('.weekly-entry').element.style.getPropertyValue('--subject-color')).toBe('#385e52');
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

  it('shows reported weekly assignments with their saved subject colors', async () => {
    const today = new Date();
    const classDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const reportedEntries = [
      {
        id: '27',
        weekday: 1,
        subjectName: 'Tutoria',
        subjectColor: '#d62e2e',
        teacherName: 'Alvaro',
        startTime: '10:00:00',
        endTime: '11:00:00',
      },
      {
        id: '7',
        weekday: 2,
        subjectName: 'Projecte',
        subjectColor: '#f50fed',
        teacherName: 'Pol',
        startTime: '10:00:00',
        endTime: '11:00:00',
      },
      {
        id: '8',
        weekday: 2,
        subjectName: 'Projecte',
        subjectColor: '#f50fed',
        teacherName: 'Pol',
        startTime: '11:30:00',
        endTime: '12:30:00',
      },
      {
        id: '21',
        weekday: 3,
        subjectName: 'Entorn de Client',
        subjectColor: '#2af226',
        teacherName: 'Alvaro',
        startTime: '10:00:00',
        endTime: '11:00:00',
      },
    ];
    fetch.mockImplementation(async (url) => {
      if (url.endsWith('/health')) return response({ status: 'ok', database: 'connected' });
      if (url.endsWith('/courses')) {
        return response({
          courses: [{
            id: '1',
            name: '2 DAW',
            academicYear: '2026-2027',
            startDate: `${today.getFullYear()}-01-01`,
            endDate: `${today.getFullYear()}-12-31`,
            isCurrent: true,
          }],
        });
      }
      if (url.includes('/month?')) return response({ classes: [] });
      if (url.includes('/schedule?')) return response({ schedule: reportedEntries });
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

    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/courses/1/schedule?date=${classDate}`,
      expect.any(Object),
    );
    expect(wrapper.findAll('.weekly-entry')).toHaveLength(4);
    for (const entry of reportedEntries) {
      const card = wrapper.findAll('.weekly-entry')
        .find((weeklyEntry) => weeklyEntry.text().includes(entry.subjectName)
          && weeklyEntry.text().includes(entry.startTime.slice(0, 5)));
      expect(card).toBeDefined();
      expect(card.element.style.getPropertyValue('--subject-color')).toBe(entry.subjectColor);
    }
    expect(wrapper.find('.weekly-grid').text()).not.toContain('IPO');
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

  it('marks every class of the selected calendar day as present', async () => {
    const today = new Date();
    const classDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const classEntries = [
      {
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
      },
      {
        scheduleEntryId: '13',
        classDate,
        subjectId: '6',
        subjectName: 'Bases de datos',
        teacherName: 'Luis García',
        startTime: '10:00:00',
        endTime: '11:00:00',
        status: 'absent',
        arrivedAt: null,
        notes: null,
      },
    ];
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
      if (url.includes('/month?')) return response({ classes: classEntries });
      if (url.includes('/attendance/') && options.method === 'PUT') {
        const entryId = url.match(/schedule\/(\d+)\/attendance/)[1];
        classEntries.find((entry) => entry.scheduleEntryId === entryId).status = JSON.parse(options.body).status;
        return response({ attendance: { status: 'present' } });
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

    await wrapper.findAll('button')
      .find((button) => button.text().trim() === 'Marcar todo el día como presente')
      .trigger('click');
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/schedule/12/attendance/${classDate}`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'present' }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/schedule/13/attendance/${classDate}`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'present' }),
      }),
    );
    expect(wrapper.text()).toContain('todas las clases del día marcadas como presentes');
    expect(wrapper.findAll('.day-class-card .attendance-status').every((status) => status.text() === 'Presente')).toBe(true);
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
