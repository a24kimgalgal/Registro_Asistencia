import { Router } from 'express';
import {
  isPositiveId,
  isValidDate,
  isValidTime,
  timeInSeconds,
} from './route-helpers.js';

function validWeekday(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function validTeacherId(value) {
  return value === null || value === undefined || isPositiveId(String(value));
}

function validEntry({ subjectId, teacherId, weekday, startTime, endTime }) {
  return isPositiveId(String(subjectId))
    && validTeacherId(teacherId)
    && validWeekday(weekday)
    && isValidTime(startTime)
    && isValidTime(endTime)
    && timeInSeconds(endTime) > timeInSeconds(startTime);
}

export function createScheduleRouter({ repositories, standalone = false }) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const courseId = standalone ? req.query.courseId : req.params.courseId;
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);
    if (!isPositiveId(courseId) || !isValidDate(date)) {
      return res.status(400).json({
        error: { code: 'INVALID_SCHEDULE_QUERY', message: 'Provide a valid courseId and date.' },
      });
    }

    const schedule = await repositories.schedule.list(courseId, date);
    return res.json({ schedule });
  });

  router.post('/', async (req, res) => {
    const courseId = standalone ? req.body?.courseId : req.params.courseId;
    const { subjectId, teacherId = null, weekday, startTime, endTime } = req.body ?? {};
    if (
      !isPositiveId(courseId)
      || !validEntry({ subjectId, teacherId, weekday, startTime, endTime })
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SCHEDULE_ENTRY',
          message: 'Provide a valid subject, optional teacher, weekday (1-5), and start/end time.',
        },
      });
    }

    const validFrom = await repositories.courses.findStartDate(courseId);
    if (!validFrom) {
      return res.status(404).json({
        error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' },
      });
    }

    const entry = await repositories.schedule.create({
      courseId,
      subjectId: String(subjectId),
      teacherId: teacherId == null ? null : String(teacherId),
      weekday,
      startTime,
      endTime,
      validFrom,
    });
    return res.status(201).json({ scheduleEntry: entry });
  });

  router.patch('/:entryId', async (req, res) => {
    const { entryId } = req.params;
    const { validUntil, subjectId, teacherId, weekday, startTime, endTime } = req.body ?? {};
    if (
      !isPositiveId(entryId)
      || !isValidDate(validUntil)
      || (subjectId !== undefined && !isPositiveId(String(subjectId)))
      || (teacherId !== undefined && !validTeacherId(teacherId))
      || (weekday !== undefined && !validWeekday(weekday))
      || (startTime !== undefined && !isValidTime(startTime))
      || (endTime !== undefined && !isValidTime(endTime))
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SCHEDULE_CHANGE',
          message: 'Provide a valid validUntil and valid optional replacement fields.',
        },
      });
    }

    const result = await repositories.schedule.change(
      entryId,
      { validUntil, subjectId, teacherId, weekday, startTime, endTime },
      validEntry,
    );

    if (!result) {
      return res.status(404).json({ error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'Schedule entry not found.' } });
    }
    if (result.invalid) {
      return res.status(409).json({
        error: { code: 'INVALID_SCHEDULE_CHANGE', message: 'The entry is already closed or validUntil must be after validFrom.' },
      });
    }
    return res.json({ scheduleEntry: result.replacement });
  });

  router.delete('/:entryId', async (req, res) => {
    const { entryId } = req.params;
    const { validUntil } = req.body ?? {};
    if (!isPositiveId(entryId) || !isValidDate(validUntil)) {
      return res.status(400).json({
        error: { code: 'INVALID_SCHEDULE_CHANGE', message: 'Provide a valid entryId and validUntil date to close the schedule entry.' },
      });
    }

    const closed = await repositories.schedule.close(entryId, validUntil);
    if (!closed) {
      return res.status(404).json({ error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'An active schedule entry with an earlier start date was not found.' } });
    }
    return res.status(204).send();
  });

  router.delete('/:entryId/permanent', async (req, res) => {
    const { entryId } = req.params;
    if (!isPositiveId(entryId)) {
      return res.status(400).json({
        error: { code: 'INVALID_ID', message: 'entryId must be a positive integer.' },
      });
    }

    const result = await repositories.schedule.deletePermanently(entryId);

    if (!result) {
      return res.status(404).json({
        error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'Schedule entry not found.' },
      });
    }
    if (result.hasAttendance) {
      return res.status(409).json({
        error: {
          code: 'SCHEDULE_ENTRY_HAS_ATTENDANCE',
          message: 'This schedule entry has attendance records and cannot be deleted.',
        },
      });
    }
    return res.status(204).send();
  });

  return router;
}
