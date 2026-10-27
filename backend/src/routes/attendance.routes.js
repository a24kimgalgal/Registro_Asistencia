import { Router } from 'express';
import {
  isPositiveId,
  isOptionalString,
  isValidDate,
  isValidTime,
} from './route-helpers.js';

const attendanceStatuses = new Set(['present', 'absent', 'late']);

function validAttendance({ status, arrivedAt, notes }) {
  return attendanceStatuses.has(status)
    && (arrivedAt === undefined || arrivedAt === null || isValidTime(arrivedAt))
    && (notes === undefined || notes === null || isOptionalString(notes))
    && (!(arrivedAt && status !== 'late'));
}

function futureAttendanceDate(date) {
  return date > new Date().toISOString().slice(0, 10);
}

function invalidAttendanceDate(res) {
  return res.status(400).json({
    error: {
      code: 'ATTENDANCE_DATE_NOT_SCHEDULED',
      message: 'The date must be a scheduled class date within the course and schedule validity period.',
    },
  });
}

function futureAttendanceError(res) {
  return res.status(400).json({
    error: {
      code: 'FUTURE_ATTENDANCE_NOT_ALLOWED',
      message: 'Attendance cannot be changed for a future date.',
    },
  });
}

function nonTeachingDayError(res) {
  return res.status(409).json({
    error: {
      code: 'ATTENDANCE_ON_NON_TEACHING_DAY',
      message: 'Attendance cannot be changed on a non-teaching day.',
    },
  });
}

export function createAttendanceRouter({ repositories }) {
  const router = Router();

  router.put('/:entryId/attendance/:date', async (req, res) => {
    const { entryId, date } = req.params;
    const { status, arrivedAt = null, notes = null } = req.body ?? {};
    if (
      !isPositiveId(entryId)
      || !isValidDate(date)
      || !validAttendance({ status, arrivedAt, notes })
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ATTENDANCE',
          message: 'Provide a valid date, status, optional arrival time for a late arrival, and optional notes.',
        },
      });
    }

    if (futureAttendanceDate(date)) return futureAttendanceError(res);

    const scheduleEntry = await repositories.attendance.findScheduleForDate(entryId, date);
    if (!scheduleEntry) {
      return res.status(404).json({
        error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'Schedule entry not found.' },
      });
    }
    if (!scheduleEntry.isScheduled) return invalidAttendanceDate(res);
    if (await repositories.nonTeachingDays.includes(scheduleEntry.academicYear, date)) {
      return nonTeachingDayError(res);
    }

    const attendance = await repositories.attendance.save({
      entryId,
      date,
      status,
      arrivedAt,
      notes,
    });
    return res.json({ attendance });
  });

  router.delete('/:entryId/attendance/:date', async (req, res) => {
    const { entryId, date } = req.params;
    if (!isPositiveId(entryId) || !isValidDate(date)) {
      return res.status(400).json({
        error: { code: 'INVALID_ATTENDANCE', message: 'Provide a valid schedule entry id and date.' },
      });
    }

    if (futureAttendanceDate(date)) return futureAttendanceError(res);

    const scheduleEntry = await repositories.attendance.findScheduleForDate(entryId, date);
    if (!scheduleEntry) {
      return res.status(404).json({
        error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'Schedule entry not found.' },
      });
    }
    if (!scheduleEntry.isScheduled) return invalidAttendanceDate(res);
    if (await repositories.nonTeachingDays.includes(scheduleEntry.academicYear, date)) {
      return nonTeachingDayError(res);
    }

    await repositories.attendance.delete(entryId, date);
    return res.status(204).send();
  });

  return router;
}
