import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';

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
    const response = await request(createApp({ database }))
      .post('/api/v1/courses')
      .send(course);

    expect(response.status).toBe(201);
    expect(response.body.course).toEqual(course);
  });

  test('rejects an invalid course date before accessing the database', async () => {
    const database = { query: jest.fn() };
    const response = await request(createApp({ database }))
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
    const response = await request(createApp({ database }))
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
    const response = await request(createApp({ database }))
      .post('/api/v1/teachers')
      .send({ name: 'Carles Narvaez' });

    expect(response.status).toBe(201);
    expect(response.body.teacher.name).toBe('Carles Narvaez');
  });
});

describe('Weekly schedule endpoints', () => {
  test('creates a class with its subject and teacher', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({
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
    const response = await request(createApp({ database }))
      .post('/api/v1/courses/4/schedule')
      .send({
        subjectId: 5,
        teacherId: 9,
        weekday: 1,
        startTime: '08:00',
        endTime: '09:00',
        validFrom: '2026-09-01',
      });

    expect(response.status).toBe(201);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO schedule_entries'),
      ['4', '5', '9', 1, '08:00', '09:00', '2026-09-01'],
    );
    expect(response.body.scheduleEntry.teacherId).toBe('9');
  });

  test('rejects invalid weekday and non-increasing times', async () => {
    const database = { query: jest.fn() };
    const response = await request(createApp({ database }))
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
});
