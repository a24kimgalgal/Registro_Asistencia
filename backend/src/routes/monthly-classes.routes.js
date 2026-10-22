import { Router } from 'express';
import { isPositiveId } from './route-helpers.js';

function validMonthQuery(year, month) {
  return typeof year === 'string'
    && /^\d{4}$/.test(year)
    && Number(year) >= 1
    && typeof month === 'string'
    && /^(0[1-9]|1[0-2])$/.test(month);
}

export function createMonthlyClassesRouter({ database }) {
  const router = Router();

  router.get('/:courseId/month', async (req, res) => {
    const { courseId } = req.params;
    const { year, month } = req.query;
    if (!isPositiveId(courseId) || !validMonthQuery(year, month)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_MONTH_QUERY',
          message: 'Provide a positive courseId, a four-digit year, and a month from 01 to 12.',
        },
      });
    }

    const courseResult = await database.query(
      'SELECT id FROM courses WHERE id = $1',
      [courseId],
    );
    if (!courseResult.rowCount) {
      return res.status(404).json({
        error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' },
      });
    }

    const monthStart = `${year}-${month}-01`;
    const result = await database.query(
      `SELECT entry.id AS "scheduleEntryId",
              day.class_date::text AS "classDate",
              entry.subject_id AS "subjectId",
              subject.name AS "subjectName",
              subject.color AS "subjectColor",
              entry.teacher_id AS "teacherId",
              teacher.name AS "teacherName",
              entry.start_time AS "startTime",
              entry.end_time AS "endTime",
              COALESCE(attendance.status, 'pending') AS status,
              attendance.arrived_at AS "arrivedAt",
              attendance.notes
         FROM courses AS course
         CROSS JOIN LATERAL generate_series(
           GREATEST($2::date, course.start_date)::timestamp,
           LEAST(($2::date + interval '1 month - 1 day')::date, course.end_date)::timestamp,
           interval '1 day'
         ) AS day(class_date)
         JOIN schedule_entries AS entry
           ON entry.course_id = course.id
          AND entry.weekday = extract(isodow FROM day.class_date)::smallint
          AND entry.valid_from <= day.class_date::date
          AND (entry.valid_until IS NULL OR entry.valid_until > day.class_date::date)
         JOIN subjects AS subject ON subject.id = entry.subject_id
         LEFT JOIN teachers AS teacher ON teacher.id = entry.teacher_id
         LEFT JOIN attendance
           ON attendance.schedule_entry_id = entry.id
          AND attendance.class_date = day.class_date::date
        WHERE course.id = $1
        ORDER BY day.class_date, entry.start_time, entry.id`,
      [courseId, monthStart],
    );

    return res.json({ courseId, year, month, classes: result.rows });
  });

  return router;
}
