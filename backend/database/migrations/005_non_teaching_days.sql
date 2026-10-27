BEGIN;

LOCK TABLE attendance, schedule_entries, courses IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS non_teaching_days (
    academic_year text NOT NULL CHECK (btrim(academic_year) <> ''),
    day_date date NOT NULL,
    CONSTRAINT non_teaching_days_academic_year_day_date_pk
        PRIMARY KEY (academic_year, day_date),
    CONSTRAINT non_teaching_days_weekday_only
        CHECK (extract(isodow FROM day_date) BETWEEN 1 AND 5)
);

INSERT INTO non_teaching_days (academic_year, day_date)
VALUES
    ('2026-2027', DATE '2026-09-11'),
    ('2026-2027', DATE '2026-09-24'),
    ('2026-2027', DATE '2026-10-12'),
    ('2026-2027', DATE '2026-10-30'),
    ('2026-2027', DATE '2026-12-07'),
    ('2026-2027', DATE '2026-12-08'),
    ('2026-2027', DATE '2026-12-22'),
    ('2026-2027', DATE '2026-12-23'),
    ('2026-2027', DATE '2026-12-24'),
    ('2026-2027', DATE '2026-12-25'),
    ('2026-2027', DATE '2026-12-28'),
    ('2026-2027', DATE '2026-12-29'),
    ('2026-2027', DATE '2026-12-30'),
    ('2026-2027', DATE '2026-12-31'),
    ('2026-2027', DATE '2027-01-01'),
    ('2026-2027', DATE '2027-01-04'),
    ('2026-2027', DATE '2027-01-05'),
    ('2026-2027', DATE '2027-01-06'),
    ('2026-2027', DATE '2027-01-07'),
    ('2026-2027', DATE '2027-02-08'),
    ('2026-2027', DATE '2027-03-22'),
    ('2026-2027', DATE '2027-03-23'),
    ('2026-2027', DATE '2027-03-24'),
    ('2026-2027', DATE '2027-03-25'),
    ('2026-2027', DATE '2027-03-26'),
    ('2026-2027', DATE '2027-03-29'),
    ('2026-2027', DATE '2027-05-14'),
    ('2026-2027', DATE '2027-05-17')
ON CONFLICT (academic_year, day_date) DO NOTHING;

DO $approved_attendance$
DECLARE
    expected_count integer;
    matching_count integer;
BEGIN
    SELECT count(*)
      INTO expected_count
      FROM (
          VALUES
              (67::bigint, 14::bigint, DATE '2026-09-24'),
              (68::bigint, 15::bigint, DATE '2026-09-24'),
              (69::bigint, 16::bigint, DATE '2026-09-24'),
              (70::bigint, 17::bigint, DATE '2026-09-24'),
              (116::bigint, 1::bigint, DATE '2026-10-12'),
              (117::bigint, 2::bigint, DATE '2026-10-12')
      ) AS expected(attendance_id, schedule_entry_id, class_date)
      JOIN attendance ON attendance.id = expected.attendance_id;

    IF expected_count NOT IN (0, 6) THEN
        RAISE EXCEPTION
            'Expected either all six approved attendance records or none; found %',
            expected_count;
    END IF;

    SELECT count(*)
      INTO matching_count
      FROM (
          VALUES
              (67::bigint, 14::bigint, DATE '2026-09-24'),
              (68::bigint, 15::bigint, DATE '2026-09-24'),
              (69::bigint, 16::bigint, DATE '2026-09-24'),
              (70::bigint, 17::bigint, DATE '2026-09-24'),
              (116::bigint, 1::bigint, DATE '2026-10-12'),
              (117::bigint, 2::bigint, DATE '2026-10-12')
      ) AS expected(attendance_id, schedule_entry_id, class_date)
      JOIN attendance
        ON attendance.id = expected.attendance_id
       AND attendance.schedule_entry_id = expected.schedule_entry_id
       AND attendance.class_date = expected.class_date
       AND attendance.status = 'present'
       AND attendance.arrived_at IS NULL
       AND attendance.notes IS NULL
      JOIN schedule_entries AS entry
        ON entry.id = expected.schedule_entry_id
       AND entry.course_id = 1
      JOIN courses AS course
        ON course.id = entry.course_id
       AND course.academic_year = '2026-2027';

    IF matching_count <> expected_count THEN
        RAISE EXCEPTION
            'Approved attendance records do not match the confirmed data; refusing migration';
    END IF;
END;
$approved_attendance$;

DELETE FROM attendance
 WHERE id IN (67, 68, 69, 70, 116, 117);

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM attendance
          JOIN schedule_entries AS entry
            ON entry.id = attendance.schedule_entry_id
          JOIN courses AS course
            ON course.id = entry.course_id
          JOIN non_teaching_days AS non_teaching_day
            ON non_teaching_day.academic_year = course.academic_year
           AND non_teaching_day.day_date = attendance.class_date
    ) THEN
        RAISE EXCEPTION
            'Existing attendance falls on a newly registered non-teaching day; refusing migration';
    END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION validate_attendance_class_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    schedule_weekday smallint;
    schedule_valid_from date;
    schedule_valid_until date;
    course_academic_year text;
BEGIN
    SELECT entry.weekday, entry.valid_from, entry.valid_until, course.academic_year
      INTO schedule_weekday, schedule_valid_from, schedule_valid_until, course_academic_year
      FROM schedule_entries AS entry
      JOIN courses AS course ON course.id = entry.course_id
     WHERE entry.id = NEW.schedule_entry_id
     FOR SHARE OF entry;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Schedule entry % does not exist', NEW.schedule_entry_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF extract(isodow FROM NEW.class_date)::smallint <> schedule_weekday
       OR NEW.class_date < schedule_valid_from
       OR (schedule_valid_until IS NOT NULL
           AND NEW.class_date >= schedule_valid_until) THEN
        RAISE EXCEPTION
            'Attendance date % is outside the schedule entry % validity or weekday',
            NEW.class_date, NEW.schedule_entry_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM non_teaching_days
         WHERE academic_year = course_academic_year
           AND day_date = NEW.class_date
    ) THEN
        RAISE EXCEPTION
            'Attendance date % is a non-teaching day for academic year %',
            NEW.class_date, course_academic_year
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'attendance_non_teaching_day';
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
