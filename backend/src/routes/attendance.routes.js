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

    const entryResult = await database.query(
      'SELECT id FROM schedule_entries WHERE id = $1',
      [entryId],
    );
    if (!entryResult.rowCount) {
      return res.status(404).json({
        error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'Schedule entry not found.' },
      });
    }

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

    const entryResult = await database.query(
      'SELECT id FROM schedule_entries WHERE id = $1',
      [entryId],
    );
    if (!entryResult.rowCount) {
      return res.status(404).json({
        error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'Schedule entry not found.' },
      });
    }

    await database.query(
      'DELETE FROM attendance WHERE schedule_entry_id = $1 AND class_date = $2',
      [entryId, date],
    );
    return res.status(204).send();
  });

  return router;
}
