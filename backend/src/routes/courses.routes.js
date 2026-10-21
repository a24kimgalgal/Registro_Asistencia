import { Router } from 'express';
import {
  isNonEmptyString,
  isPositiveId,
  isValidDate,
  withTransaction,
} from './route-helpers.js';

export function createCoursesRouter({ database }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const result = await database.query(
      `SELECT id, name, academic_year AS "academicYear",
              start_date AS "startDate", end_date AS "endDate",
              is_current AS "isCurrent", created_at AS "createdAt"
         FROM courses
        ORDER BY is_current DESC, start_date DESC, id`,
    );
    return res.json({ courses: result.rows });
  });

  router.post('/', async (req, res) => {
    const { name, academicYear, startDate, endDate, isCurrent = false } = req.body ?? {};
    if (
      !isNonEmptyString(name)
      || !isNonEmptyString(academicYear)
      || !isValidDate(startDate)
      || !isValidDate(endDate)
      || endDate < startDate
      || typeof isCurrent !== 'boolean'
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_COURSE',
          message: 'Provide a name, academicYear, valid startDate and endDate, and optional isCurrent.',
        },
      });
    }

    const insertCourse = async (client) => {
      if (isCurrent) {
        await client.query('UPDATE courses SET is_current = false WHERE is_current = true');
      }

      const result = await client.query(
        `INSERT INTO courses (name, academic_year, start_date, end_date, is_current)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, academic_year AS "academicYear",
                   start_date AS "startDate", end_date AS "endDate",
                   is_current AS "isCurrent", created_at AS "createdAt"`,
        [name.trim(), academicYear.trim(), startDate, endDate, isCurrent],
      );
      return result.rows[0];
    };

    const course = isCurrent
      ? await withTransaction(database, insertCourse)
      : await insertCourse(database);
    return res.status(201).json({ course });
  });

  router.patch('/:courseId', async (req, res) => {
    const { courseId } = req.params;
    const updates = req.body ?? {};
    if (!isPositiveId(courseId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'courseId must be a positive integer.' } });
    }

    const columns = {
      name: (value) => isNonEmptyString(value),
      academicYear: (value) => isNonEmptyString(value),
      startDate: isValidDate,
      endDate: isValidDate,
      isCurrent: (value) => typeof value === 'boolean',
    };
    const sqlColumns = {
      name: 'name',
      academicYear: 'academic_year',
      startDate: 'start_date',
      endDate: 'end_date',
      isCurrent: 'is_current',
    };
    const keys = Object.keys(updates);
    if (
      keys.length === 0
      || keys.some((key) => !columns[key] || !columns[key](updates[key]))
    ) {
      return res.status(400).json({ error: { code: 'INVALID_COURSE', message: 'Provide valid course fields to update.' } });
    }

    const updateCourse = async (client) => {
      const currentCourse = await client.query(
        'SELECT id FROM courses WHERE id = $1 FOR UPDATE',
        [courseId],
      );
      if (!currentCourse.rowCount) {
        return null;
      }
      if (updates.isCurrent === true) {
        await client.query('UPDATE courses SET is_current = false WHERE is_current = true');
      }
      const values = keys.map((key) => (
        key === 'name' || key === 'academicYear' ? updates[key].trim() : updates[key]
      ));
      const setClause = keys.map((key, index) => `${sqlColumns[key]} = $${index + 1}`).join(', ');
      const result = await client.query(
        `UPDATE courses SET ${setClause}
          WHERE id = $${keys.length + 1}
          RETURNING id, name, academic_year AS "academicYear",
                    start_date AS "startDate", end_date AS "endDate",
                    is_current AS "isCurrent", created_at AS "createdAt"`,
        [...values, courseId],
      );
      return result.rows[0];
    };

    const course = updates.isCurrent === true
      ? await withTransaction(database, updateCourse)
      : await updateCourse(database);
    if (!course) {
      return res.status(404).json({ error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' } });
    }
    return res.json({ course });
  });

  router.delete('/:courseId', async (req, res) => {
    if (!isPositiveId(req.params.courseId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'courseId must be a positive integer.' } });
    }

    const result = await database.query('DELETE FROM courses WHERE id = $1 RETURNING id', [req.params.courseId]);
    if (!result.rowCount) {
      return res.status(404).json({ error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' } });
    }
    return res.status(204).send();
  });

  return router;
}
