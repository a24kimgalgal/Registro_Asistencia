BEGIN;

CREATE TABLE teachers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (btrim(name) <> ''),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX teachers_active_name_unique_idx
    ON teachers (lower(btrim(name)))
    WHERE is_active;

ALTER TABLE schedule_entries
    ADD COLUMN teacher_id bigint REFERENCES teachers (id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION validate_schedule_entry_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    subject_is_active boolean;
    teacher_is_active boolean;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.course_id IS DISTINCT FROM OLD.course_id
           OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
           OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
           OR NEW.weekday IS DISTINCT FROM OLD.weekday
           OR NEW.start_time IS DISTINCT FROM OLD.start_time
           OR NEW.end_time IS DISTINCT FROM OLD.end_time
           OR NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN
            RAISE EXCEPTION
               'Schedule entry definitions are immutable; close the entry and create a new one'
               USING ERRCODE = 'check_violation';
        END IF;

        IF OLD.valid_until IS NOT NULL
           AND NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
            RAISE EXCEPTION 'A closed schedule entry cannot be reopened or changed'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.valid_until IS NOT NULL AND EXISTS (
            SELECT 1
              FROM attendance
             WHERE schedule_entry_id = OLD.id
               AND class_date >= NEW.valid_until
        ) THEN
            RAISE EXCEPTION
                'Schedule entry cannot be closed before or on an existing attendance date'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        SELECT is_active
          INTO subject_is_active
          FROM subjects
         WHERE id = NEW.subject_id
         FOR SHARE;

        IF FOUND AND NOT subject_is_active THEN
            RAISE EXCEPTION 'Cannot schedule an inactive subject'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.teacher_id IS NOT NULL THEN
            SELECT is_active
              INTO teacher_is_active
              FROM teachers
             WHERE id = NEW.teacher_id
             FOR SHARE;

            IF FOUND AND NOT teacher_is_active THEN
                RAISE EXCEPTION 'Cannot assign an inactive teacher'
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
