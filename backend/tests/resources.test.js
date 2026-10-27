import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createPostgresRepositories } from '../src/repositories/postgres.js';

function createTestApp(database) {
  return createApp({ repositories: createPostgresRepositories(database) });
}

describe('Course endpoints', () => {
  test('creates a course with valid dates', async () => {
    const course = {
      id: '4',
      name: '2 DAW',
      academicYear: '2026-2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
      isCurrent: true,
    };
    const database = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [course] }),
        release: jest.fn(),
      }),
    };
    const response = await request(createTestApp(database))
      .post('/api/v1/courses')
      .send(course);

    expect(response.status).toBe(201);
    expect(response.body.course).toEqual(course);
  });

  test('rejects an invalid course date before accessing the database', async () => {
    const database = { query: jest.fn() };
    const response = await request(createTestApp(database))
      .post('/api/v1/courses')
      .send({
        name: '2 DAW',
        academicYear: '2026-2027',
        startDate: '2026-02-30',
        endDate: '2027-06-30',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_COURSE');
    expect(database.query).not.toHaveBeenCalled();
  });
});

describe('Subject and teacher endpoints', () => {
  test('creates a subject for the course in the route', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: '5', courseId: '4', name: 'Programación', color: null, isActive: true }],
      }),
    };
    const response = await request(createTestApp(database))
      .post('/api/v1/courses/4/subjects')
      .send({ name: ' Programación ' });

    expect(response.status).toBe(201);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO subjects'),
      ['4', 'Programación', null],
    );
  });

  test('creates a teacher', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: '9', name: 'Carles Narvaez', isActive: true }],
      }),
    };
    const response = await request(createTestApp(database))
      .post('/api/v1/teachers')
      .send({ name: 'Carles Narvaez' });

    expect(response.status).toBe(201);
    expect(response.body.teacher.name).toBe('Carles Narvaez');
  });

  test('permanently deletes a subject that has never been scheduled', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ id: '5', isActive: true, hasSchedule: false }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    const database = { connect: jest.fn().mockResolvedValue(client) };

    const response = await request(createTestApp(database))
      .delete('/api/v1/subjects/5');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ action: 'deleted' });
    expect(client.query.mock.calls[2][0]).toContain('DELETE FROM subjects');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('deactivates a subject that has schedule history', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ id: '5', isActive: true, hasSchedule: true }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    const database = { connect: jest.fn().mockResolvedValue(client) };

    const response = await request(createTestApp(database))
      .delete('/api/v1/subjects/5');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ action: 'deactivated' });
    expect(client.query.mock.calls[2][0]).toContain('UPDATE subjects SET is_active = false');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});

describe('Weekly schedule endpoints', () => {
  test('only returns schedule entries while their course is active', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: '12',
          subjectName: 'Tutoría',
          subjectColor: '#d62e2e',
        }],
      }),
    };
    const response = await request(createTestApp(database))
      .get('/api/v1/courses/4/schedule?date=2026-10-22');

    expect(response.status).toBe(200);
    expect(database.query.mock.calls[0][0]).toContain('subject.color AS "subjectColor"');
    expect(database.query.mock.calls[0][0]).toContain('course.start_date <= $2::date');
    expect(database.query.mock.calls[0][0]).toContain('course.end_date >= $2::date');
    expect(database.query.mock.calls[0][1]).toEqual(['4', '2026-10-22']);
    expect(response.body.schedule).toEqual([{
      id: '12',
      subjectName: 'Tutoría',
      subjectColor: '#d62e2e',
    }]);
  });

  test('creates a class with its subject and teacher', async () => {
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ startDate: '2026-09-01' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: '12',
            courseId: '4',
            subjectId: '5',
            teacherId: '9',
            weekday: 1,
            startTime: '08:00:00',
            endTime: '09:00:00',
            validFrom: '2026-09-01',
          }],
        }),
    };
    const response = await request(createTestApp(database))
      .post('/api/v1/courses/4/schedule')
      .send({
        subjectId: 5,
        teacherId: 9,
        weekday: 1,
        startTime: '08:00',
        endTime: '09:00',
      });

    expect(response.status).toBe(201);
    expect(database.query.mock.calls[0]).toEqual([
      'SELECT start_date::text AS "startDate" FROM courses WHERE id = $1',
      ['4'],
    ]);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO schedule_entries'),
      ['4', '5', '9', 1, '08:00', '09:00', '2026-09-01'],
    );
    expect(response.body.scheduleEntry.teacherId).toBe('9');
  });

  test('rejects invalid weekday and non-increasing times', async () => {
    const database = { query: jest.fn() };
    const response = await request(createTestApp(database))
      .post('/api/v1/courses/4/schedule')
      .send({
        subjectId: 5,
        weekday: 6,
        startTime: '09:00',
        endTime: '08:00',
        validFrom: '2026-09-01',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_SCHEDULE_ENTRY');
    expect(database.query).not.toHaveBeenCalled();
  });

  test('permanently deletes a schedule entry without attendance', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: '12' }] })
        .mockResolvedValueOnce({ rows: [{ hasAttendance: false }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    const database = { connect: jest.fn().mockResolvedValue(client) };

    const response = await request(createTestApp(database))
      .delete('/api/v1/schedule/12/permanent');

    expect(response.status).toBe(204);
    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[3]).toEqual([
      'DELETE FROM schedule_entries WHERE id = $1',
      ['12'],
    ]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('refuses to permanently delete a schedule entry with attendance', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: '12' }] })
        .mockResolvedValueOnce({ rows: [{ hasAttendance: true }] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    const database = { connect: jest.fn().mockResolvedValue(client) };

    const response = await request(createTestApp(database))
      .delete('/api/v1/schedule/12/permanent');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SCHEDULE_ENTRY_HAS_ATTENDANCE');
    expect(client.query).not.toHaveBeenCalledWith(
      'DELETE FROM schedule_entries WHERE id = $1',
      ['12'],
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('returns not found when permanently deleting a missing schedule entry', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    const database = { connect: jest.fn().mockResolvedValue(client) };

    const response = await request(createTestApp(database))
      .delete('/api/v1/schedule/12/permanent');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SCHEDULE_ENTRY_NOT_FOUND');
  });
});
