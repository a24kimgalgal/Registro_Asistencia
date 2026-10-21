import { Router } from 'express';
import {
  isNonEmptyString,
  isPositiveId,
} from './route-helpers.js';

export function createTeachersRouter({ database }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const result = await database.query(
      `SELECT id, name, is_active AS "isActive", created_at AS "createdAt"
         FROM teachers
        ORDER BY name, id`,
    );
    return res.json({ teachers: result.rows });
  });

  router.post('/', async (req, res) => {
    const { name } = req.body ?? {};
    if (!isNonEmptyString(name)) {
      return res.status(400).json({ error: { code: 'INVALID_TEACHER', message: 'A teacher name is required.' } });
    }
    const result = await database.query(
      `INSERT INTO teachers (name)
       VALUES ($1)
       RETURNING id, name, is_active AS "isActive", created_at AS "createdAt"`,
      [name.trim()],
    );
    return res.status(201).json({ teacher: result.rows[0] });
  });

  router.patch('/:teacherId', async (req, res) => {
    const { teacherId } = req.params;
    const updates = req.body ?? {};
    const keys = Object.keys(updates);
    if (
      !isPositiveId(teacherId)
      || keys.length === 0
      || keys.some((key) => !['name', 'isActive'].includes(key))
      || (Object.hasOwn(updates, 'name') && !isNonEmptyString(updates.name))
      || (Object.hasOwn(updates, 'isActive') && typeof updates.isActive !== 'boolean')
    ) {
      return res.status(400).json({ error: { code: 'INVALID_TEACHER', message: 'Provide valid teacher fields to update.' } });
    }

    const columns = { name: 'name', isActive: 'is_active' };
    const values = keys.map((key) => (
      key === 'name' ? updates[key].trim() : updates[key]
    ));
    const setClause = keys.map((key, index) => `${columns[key]} = $${index + 1}`).join(', ');
    const result = await database.query(
      `UPDATE teachers SET ${setClause}
        WHERE id = $${keys.length + 1}
        RETURNING id, name, is_active AS "isActive", created_at AS "createdAt"`,
      [...values, teacherId],
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: { code: 'TEACHER_NOT_FOUND', message: 'Teacher not found.' } });
    }
    return res.json({ teacher: result.rows[0] });
  });

  router.delete('/:teacherId', async (req, res) => {
    if (!isPositiveId(req.params.teacherId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'teacherId must be a positive integer.' } });
    }
    const result = await database.query(
      `UPDATE teachers SET is_active = false
        WHERE id = $1 AND is_active = true
        RETURNING id`,
      [req.params.teacherId],
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: { code: 'TEACHER_NOT_FOUND', message: 'Active teacher not found.' } });
    }
    return res.status(204).send();
  });

  return router;
}
