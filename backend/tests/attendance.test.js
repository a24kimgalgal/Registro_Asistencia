import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createNonTeachingDaysRepository } from '../src/repositories/non-teaching-days.js';
import { createPostgresRepositories } from '../src/repositories/postgres.js';

function createTestApp(database) {
  return createApp({ repositories: createPostgresRepositories(database) });
}

describe('Non-teaching day repository', () => {
  test('lists non-teaching dates from PostgreSQL for an academic year range', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({
        rows: [{ date: '2026-09-24' }, { date: '2026-10-12' }],
      }),
    };
    const repository = createNonTeachingDaysRepository(database);

    await expect(repository.list('2026-2027', '2026-09-14', '2026-10-31'))
      .resolves.toEqual(['2026-09-24', '2026-10-12']);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM non_teaching_days'),
      ['2026-2027', '2026-09-14', '2026-10-31'],
    );
  });

  test('checks whether a date is non-teaching using PostgreSQL', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ '?column?': 1 }] }),
    };
    const repository = createNonTeachingDaysRepository(database);

    await expect(repository.includes('2026-2027', '2026-10-12')).resolves.toBe(true);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('day_date = $2::date'),
      ['2026-2027', '2026-10-12'],
    );
  });
});

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
        .mockResolvedValueOnce({
          rows: [{
            academicYear: '2026-2027',
            startDate: '2026-09-01',
            endDate: '2027-06-30',
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: classes }),
    };

    const response = await request(createTestApp(database))
      .get('/api/v1/courses/4/month?year=2026&month=09');

    expect(response.status).toBe(200);
    expect(response.body.classes).toEqual(classes);
    expect(response.body.nonTeachingDays).toEqual([]);
    const monthlyQuery = database.query.mock.calls[2][0];
    expect(monthlyQuery).toContain('generate_series');
    expect(monthlyQuery).toContain('entry.valid_from <= day.class_date::date');
    expect(monthlyQuery).toContain('entry.valid_until > day.class_date::date');
    expect(monthlyQuery).toContain('GREATEST($2::date, course.start_date)');
    expect(monthlyQuery).toContain('LEAST(($2::date + interval');
    expect(monthlyQuery).toContain('day.class_date::date = ANY($3::date[])');
    expect(database.query.mock.calls[1][1]).toEqual([
      '2026-2027',
      '2026-09-01',
      '2026-09-30',
    ]);
    expect(database.query.mock.calls[2][1]).toEqual(['4', '2026-09-01', []]);
  });

  test('returns course non-teaching dates and excludes them from generated classes', async () => {
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            academicYear: '2026-2027',
            startDate: '2026-09-14',
            endDate: '2027-06-15',
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-12-07' },
            { date: '2026-12-08' },
            { date: '2026-12-22' },
            { date: '2026-12-23' },
            { date: '2026-12-24' },
            { date: '2026-12-25' },
            { date: '2026-12-28' },
            { date: '2026-12-29' },
            { date: '2026-12-30' },
            { date: '2026-12-31' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const response = await request(createTestApp(database))
      .get('/api/v1/courses/4/month?year=2026&month=12');

    expect(response.status).toBe(200);
    expect(response.body.nonTeachingDays).toEqual([
      '2026-12-07',
      '2026-12-08',
      '2026-12-22',
      '2026-12-23',
      '2026-12-24',
      '2026-12-25',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
    ]);
    expect(database.query.mock.calls[2][1]).toEqual([
      '4',
      '2026-12-01',
      response.body.nonTeachingDays,
    ]);
  });

  test('does not return non-teaching dates outside the course period', async () => {
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            academicYear: '2026-2027',
            startDate: '2026-09-14',
            endDate: '2027-06-15',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ date: '2026-09-24' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const response = await request(createTestApp(database))
      .get('/api/v1/courses/4/month?year=2026&month=09');

    expect(response.status).toBe(200);
    expect(response.body.nonTeachingDays).toEqual(['2026-09-24']);
  });

  test('rejects an invalid month without querying the database', async () => {
    const database = { query: jest.fn() };
    const response = await request(createTestApp(database))
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
        .mockResolvedValueOnce({
          rows: [{ id: '12', isScheduled: true, academicYear: '2026-2027' }],
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [attendance] }),
    };

    const response = await request(createTestApp(database))
      .put('/api/v1/schedule/12/attendance/2026-09-07')
      .send({ status: 'late', arrivedAt: '09:12', notes: 'Llegada tarde' });

    expect(response.status).toBe(200);
    expect(response.body.attendance).toEqual(attendance);
    expect(database.query.mock.calls[0][0]).toContain('entry.valid_from');
    expect(database.query.mock.calls[0][0]).toContain('entry.valid_until');
    expect(database.query.mock.calls[0][0]).toContain('course.start_date');
    expect(database.query.mock.calls[0][0]).toContain('course.end_date');
    expect(database.query.mock.calls[0][0]).toContain('extract(isodow');
    expect(database.query.mock.calls[2][0]).toContain('ON CONFLICT');
    expect(database.query.mock.calls[2][1]).toEqual([
      '12', '2026-09-07', 'late', '09:12', 'Llegada tarde',
    ]);
  });

  test('rejects arrival time for a status other than late', async () => {
    const database = { query: jest.fn() };
    const response = await request(createTestApp(database))
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

    const response = await request(createTestApp(database))
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
        .mockResolvedValueOnce({
          rows: [{ id: '12', isScheduled: true, academicYear: '2026-2027' }],
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [{ status: 'present', classDate: today }] }),
    };

    const response = await request(createTestApp(database))
      .put(`/api/v1/schedule/12/attendance/${today}`)
      .send({ status: 'present' });

    expect(response.status).toBe(200);
    expect(database.query).toHaveBeenCalledTimes(3);
  });

  test('rejects a date outside the course or schedule validity', async () => {
    const database = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ id: '12', isScheduled: false }],
      }),
    };

    const response = await request(createTestApp(database))
      .put('/api/v1/schedule/12/attendance/2026-09-07')
      .send({ status: 'present' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ATTENDANCE_DATE_NOT_SCHEDULED');
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  test('does not create attendance on a non-teaching day', async () => {
    const database = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{
          id: '12',
          isScheduled: true,
          academicYear: '2026-2027',
        }],
      }).mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] }),
    };

    const response = await request(createTestApp(database))
      .put('/api/v1/schedule/12/attendance/2026-10-12')
      .send({ status: 'present' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ATTENDANCE_ON_NON_TEACHING_DAY');
    expect(database.query).toHaveBeenCalledTimes(2);
  });

  test('deletes an attendance record and returns no content', async () => {
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce({
          rows: [{ id: '12', isScheduled: true, academicYear: '2026-2027' }],
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const response = await request(createTestApp(database))
      .delete('/api/v1/schedule/12/attendance/2026-09-07');

    expect(response.status).toBe(204);
    expect(database.query.mock.calls[2][1]).toEqual(['12', '2026-09-07']);
  });

  test('does not delete an attendance record for a future date', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const database = { query: jest.fn() };

    const response = await request(createTestApp(database))
      .delete(`/api/v1/schedule/12/attendance/${date}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('FUTURE_ATTENDANCE_NOT_ALLOWED');
    expect(database.query).not.toHaveBeenCalled();
  });

  test('does not clear attendance on a non-teaching day', async () => {
    const database = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{
          id: '12',
          isScheduled: true,
          academicYear: '2026-2027',
        }],
      }).mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] }),
    };
    const response = await request(createTestApp(database))
      .delete('/api/v1/schedule/12/attendance/2026-10-12');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ATTENDANCE_ON_NON_TEACHING_DAY');
    expect(database.query).toHaveBeenCalledTimes(2);
  });
});
