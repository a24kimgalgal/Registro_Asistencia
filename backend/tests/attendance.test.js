import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Monthly classes endpoint', () => {
  test('returns scheduled classes and leaves unrecorded classes pending', async () => {
    const classes = [{
      scheduleEntryId: '12',
      classDate: '2026-09-07',
      subjectId: '5',
      subjectName: 'Programación',
      teacherName: 'Ana Pérez',
      startTime: '09:00:00',
      endTime: '10:00:00',
      status: 'pending',
      arrivedAt: null,
      notes: null,
    }];
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: '4' }] })
        .mockResolvedValueOnce({ rows: classes }),
    };

    const response = await request(createApp({ database }))
      .get('/api/v1/courses/4/month?year=2026&month=09');

    expect(response.status).toBe(200);
    expect(response.body.classes).toEqual(classes);
    const monthlyQuery = database.query.mock.calls[1][0];
    expect(monthlyQuery).toContain('generate_series');
    expect(monthlyQuery).toContain('entry.valid_from <= day.class_date::date');
    expect(monthlyQuery).toContain('entry.valid_until > day.class_date::date');
    expect(monthlyQuery).toContain('GREATEST($2::date, course.start_date)');
    expect(monthlyQuery).toContain('LEAST(($2::date + interval');
    expect(database.query.mock.calls[1][1]).toEqual(['4', '2026-09-01']);
  });

  test('rejects an invalid month without querying the database', async () => {
    const database = { query: jest.fn() };
    const response = await request(createApp({ database }))
      .get('/api/v1/courses/4/month?year=2026&month=13');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_MONTH_QUERY');
    expect(database.query).not.toHaveBeenCalled();
  });
});

describe('Attendance endpoints', () => {
  test('creates or updates an attendance record', async () => {
    const attendance = {
      id: '20',
      scheduleEntryId: '12',
      classDate: '2026-09-07',
      status: 'late',
      arrivedAt: '09:12:00',
      notes: 'Llegada tarde',
    };
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: '12', isScheduled: true }] })
        .mockResolvedValueOnce({ rows: [attendance] }),
    };

    const response = await request(createApp({ database }))
      .put('/api/v1/schedule/12/attendance/2026-09-07')
      .send({ status: 'late', arrivedAt: '09:12', notes: 'Llegada tarde' });

    expect(response.status).toBe(200);
    expect(response.body.attendance).toEqual(attendance);
    expect(database.query.mock.calls[0][0]).toContain('entry.valid_from');
    expect(database.query.mock.calls[0][0]).toContain('entry.valid_until');
    expect(database.query.mock.calls[0][0]).toContain('course.start_date');
    expect(database.query.mock.calls[0][0]).toContain('course.end_date');
    expect(database.query.mock.calls[0][0]).toContain('extract(isodow');
    expect(database.query.mock.calls[1][0]).toContain('ON CONFLICT');
    expect(database.query.mock.calls[1][1]).toEqual([
      '12', '2026-09-07', 'late', '09:12', 'Llegada tarde',
    ]);
  });

  test('rejects arrival time for a status other than late', async () => {
    const database = { query: jest.fn() };
    const response = await request(createApp({ database }))
      .put('/api/v1/schedule/12/attendance/2026-09-07')
      .send({ status: 'present', arrivedAt: '09:12' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ATTENDANCE');
    expect(database.query).not.toHaveBeenCalled();
  });

  test('rejects a future attendance date without querying the database', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const database = { query: jest.fn() };

    const response = await request(createApp({ database }))
      .put(`/api/v1/schedule/12/attendance/${date}`)
      .send({ status: 'present' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('FUTURE_ATTENDANCE_NOT_ALLOWED');
    expect(database.query).not.toHaveBeenCalled();
  });

  test('allows attendance for today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: '12', isScheduled: true }] })
        .mockResolvedValueOnce({ rows: [{ status: 'present', classDate: today }] }),
    };

    const response = await request(createApp({ database }))
      .put(`/api/v1/schedule/12/attendance/${today}`)
      .send({ status: 'present' });

    expect(response.status).toBe(200);
    expect(database.query).toHaveBeenCalledTimes(2);
  });

  test('rejects a date outside the course or schedule validity', async () => {
    const database = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ id: '12', isScheduled: false }],
      }),
    };

    const response = await request(createApp({ database }))
      .put('/api/v1/schedule/12/attendance/2026-09-07')
      .send({ status: 'present' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ATTENDANCE_DATE_NOT_SCHEDULED');
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  test('deletes an attendance record and returns no content', async () => {
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: '12', isScheduled: true }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const response = await request(createApp({ database }))
      .delete('/api/v1/schedule/12/attendance/2026-09-07');

    expect(response.status).toBe(204);
    expect(database.query.mock.calls[1][1]).toEqual(['12', '2026-09-07']);
  });

  test('does not delete an attendance record for a future date', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const database = { query: jest.fn() };

    const response = await request(createApp({ database }))
      .delete(`/api/v1/schedule/12/attendance/${date}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('FUTURE_ATTENDANCE_NOT_ALLOWED');
    expect(database.query).not.toHaveBeenCalled();
  });
});
