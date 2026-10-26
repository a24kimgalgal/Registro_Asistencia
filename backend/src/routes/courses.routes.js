import { Router } from 'express';
import {
  isNonEmptyString,
  isPositiveId,
  isValidDate,
} from './route-helpers.js';

export function createCoursesRouter({ repositories }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const courses = await repositories.courses.list();
    return res.json({ courses });
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

    const course = await repositories.courses.create({
      name: name.trim(),
      academicYear: academicYear.trim(),
      startDate,
      endDate,
      isCurrent,
    });
    return res.status(201).json({ course });
  });

  router.patch('/:courseId', async (req, res) => {
    const { courseId } = req.params;
    const updates = req.body ?? {};
    if (!isPositiveId(courseId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'courseId must be a positive integer.' } });
    }

    const validators = {
      name: (value) => isNonEmptyString(value),
      academicYear: (value) => isNonEmptyString(value),
      startDate: isValidDate,
      endDate: isValidDate,
      isCurrent: (value) => typeof value === 'boolean',
    };
    const keys = Object.keys(updates);
    if (
      keys.length === 0
      || keys.some((key) => !validators[key] || !validators[key](updates[key]))
    ) {
      return res.status(400).json({ error: { code: 'INVALID_COURSE', message: 'Provide valid course fields to update.' } });
    }

    const normalizedUpdates = { ...updates };
    if (normalizedUpdates.name !== undefined) normalizedUpdates.name = normalizedUpdates.name.trim();
    if (normalizedUpdates.academicYear !== undefined) {
      normalizedUpdates.academicYear = normalizedUpdates.academicYear.trim();
    }
    const course = await repositories.courses.update(courseId, normalizedUpdates);
    if (!course) {
      return res.status(404).json({ error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' } });
    }
    return res.json({ course });
  });

  router.delete('/:courseId', async (req, res) => {
    if (!isPositiveId(req.params.courseId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'courseId must be a positive integer.' } });
    }

    const deleted = await repositories.courses.delete(req.params.courseId);
    if (!deleted) {
      return res.status(404).json({ error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' } });
    }
    return res.status(204).send();
  });

  return router;
}
