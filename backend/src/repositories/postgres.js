async function withTransaction(database, callback) {
  if (typeof database.transaction === 'function') {
    return database.transaction(callback);
  }

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function createCoursesRepository(database) {
  return {
    async list() {
      const result = await database.query(
        `SELECT id, name, academic_year AS "academicYear",
                start_date AS "startDate", end_date AS "endDate",
                is_current AS "isCurrent", created_at AS "createdAt"
           FROM courses
          ORDER BY is_current DESC, start_date DESC, id`,
      );
      return result.rows;
    },

    async create(course) {
      const insertCourse = async (client) => {
        if (course.isCurrent) {
          await client.query('UPDATE courses SET is_current = false WHERE is_current = true');
        }
        const result = await client.query(
          `INSERT INTO courses (name, academic_year, start_date, end_date, is_current)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, academic_year AS "academicYear",
                     start_date AS "startDate", end_date AS "endDate",
                     is_current AS "isCurrent", created_at AS "createdAt"`,
          [course.name, course.academicYear, course.startDate, course.endDate, course.isCurrent],
        );
        return result.rows[0];
      };
      return course.isCurrent ? withTransaction(database, insertCourse) : insertCourse(database);
    },

    async update(courseId, updates) {
      const columns = {
        name: 'name',
        academicYear: 'academic_year',
        startDate: 'start_date',
        endDate: 'end_date',
        isCurrent: 'is_current',
      };
      const keys = Object.keys(updates);
      const updateCourse = async (client) => {
        const currentCourse = await client.query(
          'SELECT id FROM courses WHERE id = $1 FOR UPDATE',
          [courseId],
        );
        if (!currentCourse.rowCount) return null;
        if (updates.isCurrent === true) {
          await client.query('UPDATE courses SET is_current = false WHERE is_current = true');
        }
        const values = keys.map((key) => (
          key === 'name' || key === 'academicYear' ? updates[key].trim() : updates[key]
        ));
        const setClause = keys.map((key, index) => `${columns[key]} = $${index + 1}`).join(', ');
        const result = await client.query(
          `UPDATE courses SET ${setClause}
            WHERE id = $${keys.length + 1}
            RETURNING id, name, academic_year AS "academicYear",
                      start_date AS "startDate", end_date AS "endDate",
                      is_current AS "isCurrent", created_at AS "createdAt"`,
          [...values, courseId],
        );
        return result.rows[0];
      };
      return updates.isCurrent === true
        ? withTransaction(database, updateCourse)
        : updateCourse(database);
    },

    async delete(courseId) {
      const result = await database.query(
        'DELETE FROM courses WHERE id = $1 RETURNING id',
        [courseId],
      );
      return result.rowCount > 0;
    },

    async exists(courseId) {
      const result = await database.query('SELECT id FROM courses WHERE id = $1', [courseId]);
      return result.rowCount > 0;
    },

    async findStartDate(courseId) {
      const result = await database.query(
        'SELECT start_date::text AS "startDate" FROM courses WHERE id = $1',
        [courseId],
      );
      return result.rows[0]?.startDate ?? null;
    },
  };
}

function createSubjectsRepository(database) {
  return {
    async list(courseId) {
      const result = await database.query(
        `SELECT id, course_id AS "courseId", name, color,
                is_active AS "isActive", created_at AS "createdAt"
           FROM subjects
          WHERE course_id = $1
          ORDER BY name, id`,
        [courseId],
      );
      return result.rows;
    },

    async create({ courseId, name, color }) {
      const result = await database.query(
        `INSERT INTO subjects (course_id, name, color)
         VALUES ($1, $2, $3)
         RETURNING id, course_id AS "courseId", name, color,
                   is_active AS "isActive", created_at AS "createdAt"`,
        [courseId, name, color],
      );
      return result.rows[0];
    },

    async update(subjectId, updates) {
      const columns = { name: 'name', color: 'color', isActive: 'is_active' };
      const keys = Object.keys(updates);
      const values = keys.map((key) => {
        const value = updates[key];
        return key === 'name' ? value.trim() : key === 'color' ? value?.trim() || null : value;
      });
      const setClause = keys.map((key, index) => `${columns[key]} = $${index + 1}`).join(', ');
      const result = await database.query(
        `UPDATE subjects SET ${setClause}
          WHERE id = $${keys.length + 1}
          RETURNING id, course_id AS "courseId", name, color,
                    is_active AS "isActive", created_at AS "createdAt"`,
        [...values, subjectId],
      );
      return result.rows[0] ?? null;
    },

    async delete(subjectId) {
      return withTransaction(database, async (client) => {
        const subjectResult = await client.query(
          `SELECT id, is_active AS "isActive",
                  EXISTS (
                    SELECT 1 FROM schedule_entries WHERE subject_id = subjects.id
                  ) AS "hasSchedule"
             FROM subjects
            WHERE id = $1
            FOR UPDATE`,
          [subjectId],
        );
        const subject = subjectResult.rows[0];
        if (!subject || !subject.isActive) return null;

        if (subject.hasSchedule) {
          await client.query('UPDATE subjects SET is_active = false WHERE id = $1', [subjectId]);
          return { action: 'deactivated' };
        }
        await client.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
        return { action: 'deleted' };
      });
    },
  };
}

function createTeachersRepository(database) {
  return {
    async list() {
      const result = await database.query(
        `SELECT id, name, is_active AS "isActive", created_at AS "createdAt"
           FROM teachers
          ORDER BY name, id`,
      );
      return result.rows;
    },

    async create(name) {
      const result = await database.query(
        `INSERT INTO teachers (name)
         VALUES ($1)
         RETURNING id, name, is_active AS "isActive", created_at AS "createdAt"`,
        [name],
      );
      return result.rows[0];
    },

    async update(teacherId, updates) {
      const columns = { name: 'name', isActive: 'is_active' };
      const keys = Object.keys(updates);
      const values = keys.map((key) => (
        key === 'name' ? updates[key].trim() : updates[key]
      ));
      const setClause = keys.map((key, index) => `${columns[key]} = $${index + 1}`).join(', ');
      const result = await database.query(
        `UPDATE teachers SET ${setClause}
          WHERE id = $${keys.length + 1}
          RETURNING id, name, is_active AS "isActive", created_at AS "createdAt"`,
        [...values, teacherId],
      );
      return result.rows[0] ?? null;
    },

    async deactivate(teacherId) {
      const result = await database.query(
        `UPDATE teachers SET is_active = false
          WHERE id = $1 AND is_active = true
          RETURNING id`,
        [teacherId],
      );
      return result.rowCount > 0;
    },
  };
}

const scheduleSelect = `
  SELECT entry.id, entry.course_id AS "courseId",
         entry.subject_id AS "subjectId", subject.name AS "subjectName",
         entry.teacher_id AS "teacherId", teacher.name AS "teacherName",
         entry.weekday, entry.start_time AS "startTime",
         entry.end_time AS "endTime", entry.valid_from AS "validFrom",
         entry.valid_until AS "validUntil",
         (SELECT max(attendance.class_date)
            FROM attendance
           WHERE attendance.schedule_entry_id = entry.id) AS "lastAttendanceDate"
    FROM schedule_entries AS entry
    JOIN subjects AS subject ON subject.id = entry.subject_id
    LEFT JOIN teachers AS teacher ON teacher.id = entry.teacher_id
`;

function createScheduleRepository(database) {
  return {
    async list(courseId, date) {
      const result = await database.query(
        `${scheduleSelect}
          JOIN courses AS course ON course.id = entry.course_id
          WHERE entry.course_id = $1
            AND course.start_date <= $2::date
            AND course.end_date >= $2::date
            AND entry.valid_from <= $2
            AND (entry.valid_until IS NULL OR entry.valid_until > $2)
          ORDER BY entry.weekday, entry.start_time, entry.id`,
        [courseId, date],
      );
      return result.rows;
    },

    async create({ courseId, subjectId, teacherId, weekday, startTime, endTime, validFrom }) {
      const result = await database.query(
        `INSERT INTO schedule_entries
           (course_id, subject_id, teacher_id, weekday, start_time, end_time, valid_from)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, course_id AS "courseId", subject_id AS "subjectId",
                   teacher_id AS "teacherId", weekday,
                   start_time AS "startTime", end_time AS "endTime",
                   valid_from AS "validFrom", valid_until AS "validUntil"`,
        [courseId, subjectId, teacherId, weekday, startTime, endTime, validFrom],
      );
      return result.rows[0];
    },

    async change(entryId, { validUntil, subjectId, teacherId, weekday, startTime, endTime }, isValidEntry) {
      return withTransaction(database, async (client) => {
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
        if (!existing) return null;

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
          || !isValidEntry(replacement)
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
    },

    async close(entryId, validUntil) {
      const result = await database.query(
        `UPDATE schedule_entries
            SET valid_until = $1
          WHERE id = $2 AND valid_until IS NULL AND valid_from < $1
          RETURNING id`,
        [validUntil, entryId],
      );
      return result.rowCount > 0;
    },

    async deletePermanently(entryId) {
      return withTransaction(database, async (client) => {
        const entryResult = await client.query(
          'SELECT id FROM schedule_entries WHERE id = $1 FOR UPDATE',
          [entryId],
        );
        if (!entryResult.rowCount) return null;
        const attendanceResult = await client.query(
          `SELECT EXISTS (
             SELECT 1 FROM attendance WHERE schedule_entry_id = $1
           ) AS "hasAttendance"`,
          [entryId],
        );
        if (attendanceResult.rows[0].hasAttendance) return { hasAttendance: true };
        await client.query('DELETE FROM schedule_entries WHERE id = $1', [entryId]);
        return { deleted: true };
      });
    },
  };
}

function createAttendanceRepository(database) {
  return {
    async findScheduleForDate(entryId, date) {
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
      return result.rows[0] ?? null;
    },

    async save({ entryId, date, status, arrivedAt, notes }) {
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
      return result.rows[0];
    },

    async delete(entryId, date) {
      await database.query(
        'DELETE FROM attendance WHERE schedule_entry_id = $1 AND class_date = $2',
        [entryId, date],
      );
    },
  };
}

function createMonthlyClassesRepository(database) {
  return {
    async list(courseId, monthStart) {
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
      return result.rows;
    },
  };
}

function createHealthRepository(database) {
  return {
    async check() {
      await database.query('SELECT 1');
    },
  };
}

export function createPostgresRepositories(database) {
  return {
    health: createHealthRepository(database),
    courses: createCoursesRepository(database),
    subjects: createSubjectsRepository(database),
    teachers: createTeachersRepository(database),
    schedule: createScheduleRepository(database),
    attendance: createAttendanceRepository(database),
    monthlyClasses: createMonthlyClassesRepository(database),
  };
}
