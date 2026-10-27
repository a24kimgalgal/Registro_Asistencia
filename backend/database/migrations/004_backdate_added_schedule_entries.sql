BEGIN;

LOCK TABLE schedule_entries IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
    expected_ids bigint[] := ARRAY[1, 5, 6, 20];
    course_start_date date;
    schedule_trigger_enabled boolean;
BEGIN
    SELECT start_date
      INTO course_start_date
      FROM courses
     WHERE id = 1;

    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1
              FROM schedule_entries
             WHERE id = ANY (expected_ids)
        ) THEN
            RAISE EXCEPTION 'Expected schedule entries exist but course 1 is missing';
        END IF;

        RAISE NOTICE 'Course 1 is absent; no local schedule entries need backdating';
        RETURN;
    END IF;

    IF course_start_date <> DATE '2026-09-14' THEN
        RAISE EXCEPTION 'Unexpected course 1 start date: %', course_start_date;
    END IF;

    IF (
        SELECT count(*)
          FROM schedule_entries
         WHERE id = ANY (expected_ids)
    ) <> cardinality(expected_ids) THEN
        RAISE EXCEPTION 'Expected all four added schedule entries to exist';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (
              VALUES
                  (1::bigint, 1::bigint, 1::smallint, TIME '10:00', TIME '11:00', DATE '2026-10-24'),
                  (5::bigint, 5::bigint, 2::smallint, TIME '10:00', TIME '11:00', DATE '2026-10-23'),
                  (6::bigint, 5::bigint, 2::smallint, TIME '11:30', TIME '12:30', DATE '2026-10-23'),
                  (20::bigint, 4::bigint, 3::smallint, TIME '10:00', TIME '11:00', DATE '2026-10-23')
          ) AS expected(id, subject_id, weekday, start_time, end_time, valid_until)
          LEFT JOIN schedule_entries AS entry ON entry.id = expected.id
         WHERE entry.id IS NULL
            OR entry.course_id <> 1
            OR entry.subject_id <> expected.subject_id
            OR entry.weekday <> expected.weekday
            OR entry.start_time <> expected.start_time
            OR entry.end_time <> expected.end_time
            OR entry.valid_until <> expected.valid_until
            OR entry.valid_from NOT IN (DATE '2026-10-22', course_start_date)
    ) THEN
        RAISE EXCEPTION 'Added schedule entry data does not match migration preconditions';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM attendance
         WHERE schedule_entry_id = ANY (expected_ids)
    ) THEN
        RAISE EXCEPTION 'Added schedule entries contain attendance; refusing to change their historical validity';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (
              VALUES
                  (1::bigint, 27::bigint),
                  (5::bigint, 7::bigint),
                  (6::bigint, 8::bigint),
                  (20::bigint, 21::bigint)
          ) AS expected(previous_id, replacement_id)
          JOIN schedule_entries AS previous ON previous.id = expected.previous_id
          LEFT JOIN schedule_entries AS replacement ON replacement.id = expected.replacement_id
         WHERE replacement.id IS NULL
            OR replacement.course_id <> previous.course_id
            OR replacement.subject_id <> previous.subject_id
            OR replacement.weekday <> previous.weekday
            OR replacement.start_time <> previous.start_time
            OR replacement.end_time <> previous.end_time
            OR replacement.valid_from <> previous.valid_until
    ) THEN
        RAISE EXCEPTION 'Expected schedule replacement entries do not match their predecessors';
    END IF;

    SELECT (tgenabled = 'O')
      INTO schedule_trigger_enabled
      FROM pg_trigger
     WHERE tgrelid = 'schedule_entries'::regclass
       AND tgname = 'schedule_entries_validate_change'
       AND NOT tgisinternal;

    IF schedule_trigger_enabled IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Expected schedule_entries_validate_change trigger to be enabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM schedule_entries
         WHERE id = ANY (expected_ids)
           AND valid_from = DATE '2026-10-22'
    ) THEN
        RAISE NOTICE 'Added schedule entries are already backdated; no update needed';
        RETURN;
    END IF;

    ALTER TABLE schedule_entries DISABLE TRIGGER schedule_entries_validate_change;

    UPDATE schedule_entries
       SET valid_from = course_start_date
     WHERE id = ANY (expected_ids)
       AND course_id = 1
       AND valid_from = DATE '2026-10-22';

    ALTER TABLE schedule_entries ENABLE TRIGGER schedule_entries_validate_change;

    IF EXISTS (
        SELECT 1
          FROM schedule_entries
         WHERE id = ANY (expected_ids)
           AND valid_from <> course_start_date
    ) THEN
        RAISE EXCEPTION 'Not all added schedule entries were backdated';
    END IF;
END;
$migration$;

COMMIT;
