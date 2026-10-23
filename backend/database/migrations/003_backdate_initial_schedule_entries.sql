BEGIN;

LOCK TABLE schedule_entries IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
    expected_ids bigint[] := ARRAY[2, 3, 4, 14, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26];
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
        RAISE EXCEPTION 'Expected all 14 initial schedule entries to exist';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM schedule_entries
         WHERE id = ANY (expected_ids)
           AND (
               course_id <> 1
               OR valid_until IS NOT NULL
               OR valid_from NOT IN (DATE '2026-10-22', course_start_date)
           )
    ) THEN
        RAISE EXCEPTION 'Initial schedule entry data does not match migration preconditions';
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
        RAISE NOTICE 'Initial schedule entries are already backdated; no update needed';
        RETURN;
    END IF;

    ALTER TABLE schedule_entries DISABLE TRIGGER schedule_entries_validate_change;

    UPDATE schedule_entries
       SET valid_from = course_start_date
     WHERE id = ANY (expected_ids)
       AND course_id = 1
       AND valid_from = DATE '2026-10-22'
       AND valid_until IS NULL;

    ALTER TABLE schedule_entries ENABLE TRIGGER schedule_entries_validate_change;

    IF EXISTS (
        SELECT 1
          FROM schedule_entries
         WHERE id = ANY (expected_ids)
           AND valid_from <> course_start_date
    ) THEN
        RAISE EXCEPTION 'Not all initial schedule entries were backdated';
    END IF;
END;
$migration$;

COMMIT;
