import { Router } from 'express';
import {
  isNonEmptyString,
  isPositiveId,
} from './route-helpers.js';

export function createTeachersRouter({ repositories }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const teachers = await repositories.teachers.list();
    return res.json({ teachers });
  });

  router.post('/', async (req, res) => {
    const { name } = req.body ?? {};
    if (!isNonEmptyString(name)) {
      return res.status(400).json({ error: { code: 'INVALID_TEACHER', message: 'A teacher name is required.' } });
    }
    const teacher = await repositories.teachers.create(name.trim());
    return res.status(201).json({ teacher });
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

    const normalizedUpdates = { ...updates };
    if (normalizedUpdates.name !== undefined) normalizedUpdates.name = normalizedUpdates.name.trim();
    const teacher = await repositories.teachers.update(teacherId, normalizedUpdates);
    if (!teacher) {
      return res.status(404).json({ error: { code: 'TEACHER_NOT_FOUND', message: 'Teacher not found.' } });
    }
    return res.json({ teacher });
  });

  router.delete('/:teacherId', async (req, res) => {
    if (!isPositiveId(req.params.teacherId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'teacherId must be a positive integer.' } });
    }
    const deactivated = await repositories.teachers.deactivate(req.params.teacherId);
    if (!deactivated) {
      return res.status(404).json({ error: { code: 'TEACHER_NOT_FOUND', message: 'Active teacher not found.' } });
    }
    return res.status(204).send();
  });

  return router;
}
