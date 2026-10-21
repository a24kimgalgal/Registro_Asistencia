import { Router } from 'express';
import {
  isPositiveId,
  isValidDate,
  isValidTime,
  timeInSeconds,
  withTransaction,
} from './route-helpers.js';

const scheduleSelect = `
  SELECT entry.id, entry.course_id AS "courseId",
         entry.subject_id AS "subjectId", subject.name AS "subjectName",
         entry.teacher_id AS "teacherId", teacher.name AS "teacherName",
         entry.weekday, entry.start_time AS "startTime",
         entry.end_time AS "endTime", entry.valid_from AS "validFrom",
         entry.valid_until AS "validUntil"
    FROM schedule_entries AS entry
    JOIN subjects AS subject ON subject.id = entry.subject_id
    LEFT JOIN teachers AS teacher ON teacher.id = entry.teacher_id
`;

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

async function createEntry(database, {
  courseId,
  subjectId,
  teacherId,
  weekday,
  startTime,
  endTime,
  validFrom,
}) {
  const result = await database.query(
    `INSERT INTO schedule_entries
       (course_id, subject_id, teacher_id, weekday, start_time, end_time, valid_from)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, course_id AS "courseId", subject_id AS "subjectId",
               teacher_id AS "teacherId", weekday,
               start_time AS "startTime", end_time AS "endTime",
               valid_from AS "validFrom", valid_until AS "validUntil"`,
    [courseId, subjectId, teacherId ?? null, weekday, startTime, endTime, validFrom],
  );
  return result.rows[0];
}

export function createScheduleRouter({ database, standalone = false }) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const courseId = standalone ? req.query.courseId : req.params.courseId;
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);
    if (!isPositiveId(courseId) || !isValidDate(date)) {
      return res.status(400).json({
        error: { code: 'INVALID_SCHEDULE_QUERY', message: 'Provide a valid courseId and date.' },
      });
    }

    const result = await database.query(
      `${scheduleSelect}
        WHERE entry.course_id = $1
          AND entry.valid_from <= $2
          AND (entry.valid_until IS NULL OR entry.valid_until > $2)
        ORDER BY entry.weekday, entry.start_time, entry.id`,
      [courseId, date],
    );
    return res.json({ schedule: result.rows });
  });

  router.post('/', async (req, res) => {
    const courseId = standalone ? req.body?.courseId : req.params.courseId;
    const { subjectId, teacherId = null, weekday, startTime, endTime, validFrom } = req.body ?? {};
    if (
      !isPositiveId(courseId)
      || !validEntry({ subjectId, teacherId, weekday, startTime, endTime })
      || !isValidDate(validFrom)
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SCHEDULE_ENTRY',
          message: 'Provide a valid subject, optional teacher, weekday (1-5), start/end time, and validFrom.',
        },
      });
    }

    const entry = await createEntry(database, {
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

    const result = await withTransaction(database, async (client) => {
      const existingResult = await client.query(
        `SELECT id, course_id AS "courseId", subject_id AS "subjectId",
                teacher_id AS "teacherId", weekday, start_time AS "startTime",
                end_time AS "endTime", valid_from AS "validFrom",
                valid_until AS "validUntil"
           FROM schedule_entries
          WHERE id = $1
          FOR UPDATE`,
        [entryId],
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        return null;
      }

      const replacement = {
        subjectId: subjectId === undefined ? String(existing.subjectId) : String(subjectId),
        teacherId: teacherId === undefined ? existing.teacherId : teacherId,
        weekday: weekday === undefined ? existing.weekday : weekday,
        startTime: startTime === undefined ? existing.startTime : startTime,
        endTime: endTime === undefined ? existing.endTime : endTime,
      };
      if (
        existing.validUntil !== null
        || validUntil <= existing.validFrom
        || !validEntry(replacement)
      ) {
        return { invalid: true };
      }

      const closeResult = await client.query(
        `UPDATE schedule_entries
            SET valid_until = $1
          WHERE id = $2
          RETURNING id`,
        [validUntil, entryId],
      );
      const replacementResult = await client.query(
        `INSERT INTO schedule_entries
           (course_id, subject_id, teacher_id, weekday, start_time, end_time, valid_from)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, course_id AS "courseId", subject_id AS "subjectId",
                   teacher_id AS "teacherId", weekday,
                   start_time AS "startTime", end_time AS "endTime",
                   valid_from AS "validFrom", valid_until AS "validUntil"`,
        [
          existing.courseId,
          replacement.subjectId,
          replacement.teacherId,
          replacement.weekday,
          replacement.startTime,
          replacement.endTime,
          validUntil,
        ],
      );
      return { closedId: closeResult.rows[0].id, replacement: replacementResult.rows[0] };
    });

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

    const result = await database.query(
      `UPDATE schedule_entries
          SET valid_until = $1
        WHERE id = $2 AND valid_until IS NULL AND valid_from < $1
        RETURNING id`,
      [validUntil, entryId],
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: { code: 'SCHEDULE_ENTRY_NOT_FOUND', message: 'An active schedule entry with an earlier start date was not found.' } });
    }
    return res.status(204).send();
  });

  return router;
}
