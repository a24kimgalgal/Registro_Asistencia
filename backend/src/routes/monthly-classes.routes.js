import { Router } from 'express';
import { isPositiveId } from './route-helpers.js';

function validMonthQuery(year, month) {
  return typeof year === 'string'
    && /^\d{4}$/.test(year)
    && Number(year) >= 1
    && typeof month === 'string'
    && /^(0[1-9]|1[0-2])$/.test(month);
}

export function createMonthlyClassesRouter({ repositories }) {
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

    const course = await repositories.courses.findCalendarInfo(courseId);
    if (!course) {
      return res.status(404).json({
        error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' },
      });
    }

    const monthStart = `${year}-${month}-01`;
    const monthEnd = new Date(Date.UTC(Number(year), Number(month), 0))
      .toISOString()
      .slice(0, 10);
    const nonTeachingDays = await repositories.nonTeachingDays.list(
      course.academicYear,
      monthStart > course.startDate ? monthStart : course.startDate,
      monthEnd < course.endDate ? monthEnd : course.endDate,
    );
    const classes = await repositories.monthlyClasses.list(
      courseId,
      monthStart,
      nonTeachingDays,
    );
    return res.json({ courseId, year, month, classes, nonTeachingDays });
  });

  return router;
}
