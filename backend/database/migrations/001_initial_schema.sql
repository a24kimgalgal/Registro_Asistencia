BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE courses (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (btrim(name) <> ''),
    academic_year text NOT NULL CHECK (btrim(academic_year) <> ''),
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_current boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT courses_dates_valid CHECK (end_date >= start_date),
    CONSTRAINT courses_name_year_unique UNIQUE (academic_year, name)
);

CREATE UNIQUE INDEX courses_one_current_idx
    ON courses (is_current)
    WHERE is_current;

CREATE TABLE subjects (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id bigint NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (btrim(name) <> ''),
    color text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT subjects_course_id_id_unique UNIQUE (course_id, id)
);

CREATE UNIQUE INDEX subjects_course_name_unique_idx
    ON subjects (course_id, lower(btrim(name)));

CREATE TABLE schedule_entries (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id bigint NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
    subject_id bigint NOT NULL,
    weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 5),
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    valid_from date NOT NULL,
    valid_until date,
    CONSTRAINT schedule_entries_subject_course_fk
        FOREIGN KEY (course_id, subject_id)
        REFERENCES subjects (course_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT schedule_entries_times_valid CHECK (end_time > start_time),
    CONSTRAINT schedule_entries_validity_valid
        CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT schedule_entries_no_overlap
        EXCLUDE USING gist (
            course_id WITH =,
            weekday WITH =,
            (daterange(valid_from, valid_until, '[)')) WITH &&,
            (int8range(
                (extract(epoch FROM start_time) * 1000000)::bigint,
                (extract(epoch FROM end_time) * 1000000)::bigint,
                '[)'
            )) WITH &&
        )
);

CREATE INDEX schedule_entries_course_weekday_validity_idx
    ON schedule_entries (course_id, weekday, valid_from, valid_until);

CREATE FUNCTION validate_schedule_entry_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    subject_is_active boolean;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.course_id IS DISTINCT FROM OLD.course_id
           OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
           OR NEW.weekday IS DISTINCT FROM OLD.weekday
           OR NEW.start_time IS DISTINCT FROM OLD.start_time
           OR NEW.end_time IS DISTINCT FROM OLD.end_time
           OR NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN
            RAISE EXCEPTION
                'Schedule entry definitions are immutable; close the entry and create a new one';
        END IF;

        IF OLD.valid_until IS NOT NULL
           AND NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
            RAISE EXCEPTION 'A closed schedule entry cannot be reopened or changed';
        END IF;

        IF NEW.valid_until IS NOT NULL AND EXISTS (
            SELECT 1
              FROM attendance
             WHERE schedule_entry_id = OLD.id
               AND class_date >= NEW.valid_until
        ) THEN
            RAISE EXCEPTION
                'Schedule entry cannot be closed before or on an existing attendance date';
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        SELECT is_active
          INTO subject_is_active
          FROM subjects
         WHERE id = NEW.subject_id
         FOR SHARE;

        IF FOUND AND NOT subject_is_active THEN
            RAISE EXCEPTION 'Cannot schedule an inactive subject';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_entries_validate_change
    BEFORE INSERT OR UPDATE ON schedule_entries
    FOR EACH ROW
    EXECUTE FUNCTION validate_schedule_entry_change();

CREATE TABLE attendance (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schedule_entry_id bigint NOT NULL
        REFERENCES schedule_entries (id) ON DELETE RESTRICT,
    class_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('present', 'absent', 'late')),
    arrived_at time without time zone,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attendance_one_record_per_class_date
        UNIQUE (schedule_entry_id, class_date),
    CONSTRAINT attendance_arrival_only_for_late
        CHECK (arrived_at IS NULL OR status = 'late')
);

CREATE INDEX attendance_class_date_entry_idx
    ON attendance (class_date, schedule_entry_id);

CREATE FUNCTION set_attendance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_set_updated_at
    BEFORE UPDATE ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION set_attendance_updated_at();

CREATE FUNCTION validate_attendance_class_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    schedule_weekday smallint;
    schedule_valid_from date;
    schedule_valid_until date;
BEGIN
    SELECT weekday, valid_from, valid_until
      INTO schedule_weekday, schedule_valid_from, schedule_valid_until
      FROM schedule_entries
     WHERE id = NEW.schedule_entry_id
     FOR SHARE;

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

    RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_validate_class_date
    BEFORE INSERT OR UPDATE OF schedule_entry_id, class_date ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION validate_attendance_class_date();

COMMIT;
