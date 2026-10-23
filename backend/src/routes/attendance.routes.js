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

async function findScheduleForDate(database, entryId, date) {
  const result = await database.query(
    `SELECT entry.id,
            ($2::date BETWEEN course.start_date AND course.end_date
             AND $2::date >= entry.valid_from
             AND (entry.valid_until IS NULL OR $2::date < entry.valid_until)
             AND entry.weekday = extract(isodow FROM $2::date)::smallint) AS "isScheduled"
       FROM schedule_entries AS entry
       JOIN courses AS course ON course.id = entry.course_id
      WHERE entry.id = $1`,
    [entryId, date],
  );
  return result.rows[0];
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

export function createAttendanceRouter({ database }) {
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

    const scheduleEntry = await findScheduleForDate(database, entryId, date);
    if (!scheduleEntry) {
      return res.status(404).json({
        error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'Schedule entry not found.' },
      });
    }
    if (!scheduleEntry.isScheduled) return invalidAttendanceDate(res);

    const result = await database.query(
      `INSERT INTO attendance (schedule_entry_id, class_date, status, arrived_at, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (schedule_entry_id, class_date)
       DO UPDATE SET status = EXCLUDED.status,
                     arrived_at = EXCLUDED.arrived_at,
                     notes = EXCLUDED.notes
       RETURNING id, schedule_entry_id AS "scheduleEntryId",
                 class_date AS "classDate", status, arrived_at AS "arrivedAt",
                 notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [entryId, date, status, arrivedAt, notes],
    );
    return res.json({ attendance: result.rows[0] });
  });

  router.delete('/:entryId/attendance/:date', async (req, res) => {
    const { entryId, date } = req.params;
    if (!isPositiveId(entryId) || !isValidDate(date)) {
      return res.status(400).json({
        error: { code: 'INVALID_ATTENDANCE', message: 'Provide a valid schedule entry id and date.' },
      });
    }

    if (futureAttendanceDate(date)) return futureAttendanceError(res);

    const scheduleEntry = await findScheduleForDate(database, entryId, date);
    if (!scheduleEntry) {
      return res.status(404).json({
        error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'Schedule entry not found.' },
      });
    }
    if (!scheduleEntry.isScheduled) return invalidAttendanceDate(res);

    await database.query(
      'DELETE FROM attendance WHERE schedule_entry_id = $1 AND class_date = $2',
      [entryId, date],
    );
    return res.status(204).send();
  });

  return router;
}
