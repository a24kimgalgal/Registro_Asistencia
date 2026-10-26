import { Router } from 'express';
import {
  isNonEmptyString,
  isOptionalString,
  isPositiveId,
} from './route-helpers.js';

export function createSubjectsRouter({ repositories, standalone = false }) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const courseId = standalone ? req.query.courseId : req.params.courseId;
    if (!isPositiveId(courseId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'A valid courseId is required.' } });
    }

    const subjects = await repositories.subjects.list(courseId);
    return res.json({ subjects });
  });

  router.post('/', async (req, res) => {
    const courseId = standalone ? req.body?.courseId : req.params.courseId;
    const { name, color = null } = req.body ?? {};
    if (!isPositiveId(courseId) || !isNonEmptyString(name) || !isOptionalString(color)) {
      return res.status(400).json({
        error: { code: 'INVALID_SUBJECT', message: 'Provide a valid courseId, name, and optional color.' },
      });
    }

    const subject = await repositories.subjects.create({
      courseId,
      name: name.trim(),
      color: color?.trim() || null,
    });
    return res.status(201).json({ subject });
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

    const subject = await repositories.subjects.update(subjectId, updates);
    if (!subject) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found.' } });
    }
    return res.json({ subject });
  });

  router.delete('/:subjectId', async (req, res) => {
    const { subjectId } = req.params;
    if (!isPositiveId(subjectId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'subjectId must be a positive integer.' } });
    }

    const result = await repositories.subjects.delete(subjectId);

    if (!result) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Active subject not found.' } });
    }
    return res.json({ action: result.action });
  });

  return router;
}
