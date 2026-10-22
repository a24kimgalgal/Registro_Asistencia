import { Router } from 'express';
import {
  isNonEmptyString,
  isOptionalString,
  isPositiveId,
  withTransaction,
} from './route-helpers.js';

export function createSubjectsRouter({ database, standalone = false }) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const courseId = standalone ? req.query.courseId : req.params.courseId;
    if (!isPositiveId(courseId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'A valid courseId is required.' } });
    }

    const result = await database.query(
      `SELECT id, course_id AS "courseId", name, color,
              is_active AS "isActive", created_at AS "createdAt"
         FROM subjects
        WHERE course_id = $1
        ORDER BY name, id`,
      [courseId],
    );
    return res.json({ subjects: result.rows });
  });

  router.post('/', async (req, res) => {
    const courseId = standalone ? req.body?.courseId : req.params.courseId;
    const { name, color = null } = req.body ?? {};
    if (!isPositiveId(courseId) || !isNonEmptyString(name) || !isOptionalString(color)) {
      return res.status(400).json({
        error: { code: 'INVALID_SUBJECT', message: 'Provide a valid courseId, name, and optional color.' },
      });
    }

    const result = await database.query(
      `INSERT INTO subjects (course_id, name, color)
       VALUES ($1, $2, $3)
       RETURNING id, course_id AS "courseId", name, color,
                 is_active AS "isActive", created_at AS "createdAt"`,
      [courseId, name.trim(), color?.trim() || null],
    );
    return res.status(201).json({ subject: result.rows[0] });
  });

  router.patch('/:subjectId', async (req, res) => {
    const { subjectId } = req.params;
    const updates = req.body ?? {};
    const keys = Object.keys(updates);
    const allowed = ['name', 'color', 'isActive'];
    if (
      !isPositiveId(subjectId)
      || keys.length === 0
      || keys.some((key) => !allowed.includes(key))
      || (Object.hasOwn(updates, 'name') && !isNonEmptyString(updates.name))
      || (Object.hasOwn(updates, 'color') && !isOptionalString(updates.color))
      || (Object.hasOwn(updates, 'isActive') && typeof updates.isActive !== 'boolean')
    ) {
      return res.status(400).json({ error: { code: 'INVALID_SUBJECT', message: 'Provide valid subject fields to update.' } });
    }

    const columns = { name: 'name', color: 'color', isActive: 'is_active' };
    const values = keys.map((key) => {
      const value = updates[key];
      return key === 'name' ? value.trim() : key === 'color' ? value?.trim() || null : value;
    });
    const setClause = keys.map((key, index) => `${columns[key]} = $${index + 1}`).join(', ');
    const result = await database.query(
      `UPDATE subjects SET ${setClause}
        WHERE id = $${keys.length + 1}
        RETURNING id, course_id AS "courseId", name, color,
                  is_active AS "isActive", created_at AS "createdAt"`,
      [...values, subjectId],
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found.' } });
    }
    return res.json({ subject: result.rows[0] });
  });

  router.delete('/:subjectId', async (req, res) => {
    const { subjectId } = req.params;
    if (!isPositiveId(subjectId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'subjectId must be a positive integer.' } });
    }

    const result = await withTransaction(database, async (client) => {
      const subjectResult = await client.query(
        `SELECT id, is_active AS "isActive",
                EXISTS (
                  SELECT 1 FROM schedule_entries WHERE subject_id = subjects.id
                ) AS "hasSchedule"
           FROM subjects
          WHERE id = $1
          FOR UPDATE`,
        [subjectId],
      );
      const subject = subjectResult.rows[0];
      if (!subject || !subject.isActive) return null;

      if (subject.hasSchedule) {
        await client.query(
          'UPDATE subjects SET is_active = false WHERE id = $1',
          [subjectId],
        );
        return { action: 'deactivated' };
      }

      await client.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
      return { action: 'deleted' };
    });

    if (!result) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Active subject not found.' } });
    }
    return res.json({ action: result.action });
  });

  return router;
}
