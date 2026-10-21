import express from 'express';
import { createCoursesRouter } from './routes/courses.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createScheduleRouter } from './routes/schedule.routes.js';
import { createSubjectsRouter } from './routes/subjects.routes.js';
import { createTeachersRouter } from './routes/teachers.routes.js';

export function createApp({ database, logger = console }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1/health', createHealthRouter({ database, logger }));
  app.use('/api/v1/courses', createCoursesRouter({ database }));
  app.use('/api/v1/courses/:courseId/subjects', createSubjectsRouter({ database }));
  app.use('/api/v1/subjects', createSubjectsRouter({ database, standalone: true }));
  app.use('/api/v1/teachers', createTeachersRouter({ database }));
  app.use('/api/v1/courses/:courseId/schedule', createScheduleRouter({ database }));
  app.use('/api/v1/schedule', createScheduleRouter({ database, standalone: true }));

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    const databaseErrors = {
      '22P02': [400, 'INVALID_DATA', 'One or more values are invalid.'],
      '23502': [400, 'INVALID_DATA', 'Required values are missing.'],
      '23503': [409, 'RELATED_DATA_EXISTS', 'This change conflicts with related data.'],
      '23505': [409, 'DUPLICATE_RESOURCE', 'A resource with these values already exists.'],
      '23514': [400, 'INVALID_DATA', 'One or more values do not meet the requirements.'],
      '23P01': [409, 'SCHEDULE_OVERLAP', 'The schedule overlaps another class.'],
    };
    const databaseError = databaseErrors[error.code];
    if (databaseError) {
      return res.status(databaseError[0]).json({
        error: { code: databaseError[1], message: databaseError[2] },
      });
    }

    logger.error('Unhandled request error', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
  });

  return app;
}
