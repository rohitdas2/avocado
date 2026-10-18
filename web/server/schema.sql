-- Repeatable schema. Each block is guarded so every earlier database shape converges here.
-- Users (formerly accounts). Rename first so the CREATE below never makes a second, empty table.
DO $$ BEGIN
  IF to_regclass('accounts') IS NOT NULL AND to_regclass('users') IS NULL THEN
    ALTER TABLE accounts RENAME TO users;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  email TEXT UNIQUE CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(trim(email))),
  password TEXT CHECK (password ~ '^sha512[$][0-9a-f]{32}[$][0-9a-f]{128}$'),
  is_guest BOOLEAN NOT NULL DEFAULT false,
  CHECK ((is_guest AND email IS NULL AND password IS NULL) OR (NOT is_guest AND email IS NOT NULL AND password IS NOT NULL)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Older tables keep their account_id column names; they reference users(id).
CREATE TABLE IF NOT EXISTS account_sessions (
  token_digest TEXT PRIMARY KEY CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  account_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_sessions_account_idx ON account_sessions (account_id);
CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx ON account_sessions (expires_at);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  client_key TEXT PRIMARY KEY,
  window_start BIGINT NOT NULL,
  attempts BIGINT NOT NULL CHECK (attempts > 0)
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_window_idx ON auth_rate_limits (window_start);
CREATE TABLE IF NOT EXISTS food_entries (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  calories INTEGER NOT NULL CHECK (calories BETWEEN 0 AND 100000),
  entry_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_entries_date_idx ON food_entries (entry_date);
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS protein DOUBLE PRECISION CHECK (protein BETWEEN 0 AND 100000);
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS carbs DOUBLE PRECISION CHECK (carbs BETWEEN 0 AND 100000);
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS fat DOUBLE PRECISION CHECK (fat BETWEEN 0 AND 100000);
-- Old entries remain unowned until an explicit account migration is performed.
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS food_entries_account_date_idx ON food_entries (account_id, entry_date);
-- @workout-sessions (tests split here to recreate the pre-workout schema)
-- Workout sessions (formerly workouts): a named, dated session owned by one user.
DO $$ BEGIN
  IF to_regclass('workouts') IS NOT NULL AND to_regclass('workout_sessions') IS NULL THEN
    ALTER TABLE workouts RENAME TO workout_sessions;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'workout_sessions' AND column_name = 'account_id') THEN
    ALTER TABLE workout_sessions RENAME COLUMN account_id TO user_id;
  END IF;
END $$;
ALTER INDEX IF EXISTS workouts_account_date_idx RENAME TO workout_sessions_user_date_idx;
ALTER INDEX IF EXISTS workouts_current_idx RENAME TO workout_sessions_current_idx;
CREATE TABLE IF NOT EXISTS workout_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  entry_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workout_sessions_user_date_idx ON workout_sessions (user_id, entry_date);
CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_current_idx ON workout_sessions (user_id) WHERE is_current;
-- App-owned exercise catalog. Only this file adds definitions; the API exposes no catalog writes.
CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Stable, hard-coded IDs (UUIDv5) keep references identical across every database; never change one.
INSERT INTO exercises (id, slug, name, category, aliases) VALUES
  ('120aac58-9341-55e8-afcf-e209a167db42', 'back-squat', 'Back squat', 'legs', '{squat}'),
  ('4444f723-7051-5d99-88d5-9d9c4de04bd8', 'front-squat', 'Front squat', 'legs', '{}'),
  ('c13015a5-bfe0-57a9-b7f2-dc29696589d3', 'deadlift', 'Deadlift', 'back', '{}'),
  ('7d8002bf-0d46-57f5-a8bd-63bc7377ad55', 'romanian-deadlift', 'Romanian deadlift', 'legs', '{rdl}'),
  ('e65a4e83-f099-52ed-875f-b595e163e5d4', 'leg-press', 'Leg press', 'legs', '{}'),
  ('19439fa0-5fc6-5bd4-93f2-7132e886dfbc', 'lunge', 'Lunge', 'legs', '{lunges}'),
  ('b31a8e7c-c54b-5e42-b76b-8fce5c46b441', 'bulgarian-split-squat', 'Bulgarian split squat', 'legs', '{split squat,bss,rear foot elevated split squat,rfess}'),
  ('6421f8c0-dee0-5461-8e1f-148600f7846e', 'leg-curl', 'Leg curl', 'legs', '{}'),
  ('36f64b58-a197-540f-8981-c9b32d9a4d05', 'leg-extension', 'Leg extension', 'legs', '{}'),
  ('d8ae2073-345c-5167-b985-5085eaeb1507', 'calf-raise', 'Calf raise', 'legs', '{calf raises}'),
  ('36d4efb4-f681-51d2-94b2-33ee22964367', 'hip-thrust', 'Hip thrust', 'legs', '{}'),
  ('585ce720-b33a-58a4-b8cb-dcbadaa5992e', 'bench-press', 'Bench press', 'chest', '{bench}'),
  ('d15569bf-aa63-5938-887d-3fa7ae8b324c', 'incline-bench-press', 'Incline bench press', 'chest', '{incline bench}'),
  ('7dfd8496-873d-5be7-8b96-e1d5279cbfcc', 'dumbbell-bench-press', 'Dumbbell bench press', 'chest', '{db bench}'),
  ('642d0e4b-5894-5c8c-9a09-d63abdb48a22', 'chest-fly', 'Chest fly', 'chest', '{fly}'),
  ('4a13c494-b71d-5ab7-9de8-6d06092bc218', 'push-up', 'Push-up', 'chest', '{pushup,push-ups,pushups}'),
  ('18da7003-613b-566d-99d7-aa6c8a202b7c', 'dip', 'Dip', 'chest', '{dips}'),
  ('f258cec4-01be-5af7-852b-96ec979f5dc5', 'overhead-press', 'Overhead press', 'shoulders', '{ohp,shoulder press,military press}'),
  ('4e73fc72-9b31-5a20-87f9-58cf22487572', 'lateral-raise', 'Lateral raise', 'shoulders', '{lateral raises}'),
  ('2d0e63fb-ff8e-5df5-a641-8afac89faf54', 'rear-delt-fly', 'Rear delt fly', 'shoulders', '{}'),
  ('f273c94b-e39c-55f6-93ab-ba6257f1c912', 'barbell-row', 'Barbell row', 'back', '{row,bent-over row}'),
  ('00d62489-9e9f-5352-b9e8-29c886d1b72f', 'dumbbell-row', 'Dumbbell row', 'back', '{db row}'),
  ('39d4bf38-5171-52d2-bcd4-97741a8ba5a6', 'lat-pulldown', 'Lat pulldown', 'back', '{pulldown}'),
  ('cce1de36-21bb-5e19-a1e3-9854391051cb', 'pull-up', 'Pull-up', 'back', '{pullup,pull-ups,pullups}'),
  ('04a487a5-4806-50a4-b1f9-bba265529eea', 'chin-up', 'Chin-up', 'back', '{chinup,chin-ups}'),
  ('fdf2ad4a-82f0-548a-b2f9-bbc7a2e9833d', 'seated-cable-row', 'Seated cable row', 'back', '{cable row}'),
  ('e4298086-a76d-57ec-89c6-0c20ce3291b1', 'face-pull', 'Face pull', 'shoulders', '{face pulls}'),
  ('4f7223bb-c431-51c8-8631-4b3018485f00', 'biceps-curl', 'Biceps curl', 'arms', '{curl,bicep curl,curls}'),
  ('6c50fa87-10ba-539e-a3c7-9e9d40c00b06', 'hammer-curl', 'Hammer curl', 'arms', '{}'),
  ('e6f6d2f3-6edc-500d-bc0a-ed499264e95e', 'triceps-pushdown', 'Triceps pushdown', 'arms', '{tricep pushdown,pushdown}'),
  ('ccec386a-348d-524e-9301-29aa355fbbab', 'skull-crusher', 'Skull crusher', 'arms', '{skullcrusher}'),
  ('ff6eafc0-0e68-5eb6-b76c-c2cf80b59737', 'plank', 'Plank', 'core', '{}'),
  ('8f0bdbd4-effa-5c45-b2ea-4ca6fdfed610', 'crunch', 'Crunch', 'core', '{crunches}'),
  ('6e4cc214-c2ef-5837-be3a-e771ce7732e4', 'hanging-leg-raise', 'Hanging leg raise', 'core', '{leg raise}'),
  ('574b3521-7983-56bd-8774-35917083e8ae', 'kettlebell-swing', 'Kettlebell swing', 'full body', '{kb swing}')

ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, category = EXCLUDED.category, aliases = EXCLUDED.aliases;
-- Rename the oldest exercise table in place, retaining IDs and precise timestamps.
DO $$ BEGIN
  IF to_regclass('lift_entries') IS NOT NULL AND to_regclass('workout_exercises') IS NULL THEN
    ALTER TABLE lift_entries RENAME TO workout_exercises;
  END IF;
END $$;
-- One catalog exercise performed within one session. A row with no catalog match keeps its old
-- free-text name in legacy_name so history is never rewritten or invented.
CREATE TABLE IF NOT EXISTS workout_exercises (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id),
  legacy_name TEXT CHECK (legacy_name IS NULL OR length(trim(legacy_name)) BETWEEN 1 AND 120),
  CHECK (exercise_id IS NOT NULL OR legacy_name IS NOT NULL),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Pre-workout rows had no session boundary: preserve one historical session per owner/day.
-- Unowned legacy data stays unowned and inaccessible; never assign it to a guest.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'workout_exercises' AND column_name = 'entry_date') THEN
    ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES users(id);
    ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES workout_sessions(id) ON DELETE CASCADE;
    INSERT INTO workout_sessions (id, user_id, name, entry_date, created_at)
      SELECT (array_agg(id ORDER BY created_at, id))[1], account_id, 'Workout', entry_date, min(created_at)
      FROM workout_exercises GROUP BY account_id, entry_date;
    UPDATE workout_exercises e SET session_id = w.id FROM workout_sessions w
      WHERE w.user_id IS NOT DISTINCT FROM e.account_id AND w.entry_date = e.entry_date;
    ALTER TABLE workout_exercises ALTER COLUMN session_id SET NOT NULL;
    ALTER TABLE workout_exercises DROP COLUMN account_id, DROP COLUMN entry_date;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'workout_exercises' AND column_name = 'workout_id') THEN
    ALTER TABLE workout_exercises RENAME COLUMN workout_id TO session_id;
  END IF;
END $$;
ALTER INDEX IF EXISTS workout_exercises_workout_idx RENAME TO workout_exercises_session_idx;
CREATE INDEX IF NOT EXISTS workout_exercises_session_idx ON workout_exercises (session_id, created_at);
-- Individual sets: the performance record. Weight and unit are per set (drop sets, warm-ups).
CREATE TABLE IF NOT EXISTS exercise_sets (
  id UUID PRIMARY KEY,
  workout_exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL CHECK (set_number BETWEEN 1 AND 100),
  reps INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 1000),
  weight DOUBLE PRECISION NOT NULL CHECK (weight BETWEEN 0 AND 10000),
  unit TEXT NOT NULL CHECK (unit IN ('lb', 'kg')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Deferrable so deleting a set can shift later sets down in one UPDATE (checked per statement,
  -- not per row); numbers stay 1..n with no gaps.
  CONSTRAINT exercise_sets_workout_exercise_id_set_number_key UNIQUE (workout_exercise_id, set_number) DEFERRABLE
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'exercise_sets'::regclass
             AND conname = 'exercise_sets_workout_exercise_id_set_number_key' AND NOT condeferrable) THEN
    ALTER TABLE exercise_sets DROP CONSTRAINT exercise_sets_workout_exercise_id_set_number_key;
    -- Close gaps left by earlier deletes before restoring the constraint.
    UPDATE exercise_sets s SET set_number = r.n FROM (
      SELECT id, row_number() OVER (PARTITION BY workout_exercise_id ORDER BY set_number) AS n FROM exercise_sets) r
      WHERE s.id = r.id AND s.set_number <> r.n;
    ALTER TABLE exercise_sets ADD CONSTRAINT exercise_sets_workout_exercise_id_set_number_key
      UNIQUE (workout_exercise_id, set_number) DEFERRABLE;
  END IF;
END $$;
-- Aggregate rows (exercise text + sets × reps @ weight) expand into one set row per set.
-- Set IDs are derived from the exercise ID and set number, so a rerun cannot duplicate them.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'workout_exercises' AND column_name = 'sets') THEN
    ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS exercise_id UUID REFERENCES exercises(id);
    ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS legacy_name TEXT;
    INSERT INTO exercise_sets (id, workout_exercise_id, set_number, reps, weight, unit, created_at)
      SELECT md5(e.id::text || ':' || n)::uuid, e.id, n, e.reps, e.weight, e.unit, e.created_at
      FROM workout_exercises e CROSS JOIN LATERAL generate_series(1, e.sets) AS n
      -- NOT EXISTS rather than ON CONFLICT: a deferrable constraint cannot be a conflict arbiter.
      WHERE NOT EXISTS (SELECT 1 FROM exercise_sets x WHERE x.workout_exercise_id = e.id AND x.set_number = n);
    UPDATE workout_exercises e SET exercise_id = (
        SELECT c.id FROM exercises c
        WHERE lower(c.name) = lower(trim(e.exercise)) OR lower(trim(e.exercise)) = ANY (c.aliases)
        ORDER BY (lower(c.name) = lower(trim(e.exercise))) DESC LIMIT 1);
    -- Keep the original text for every row; matched rows still show what was typed.
    UPDATE workout_exercises SET legacy_name = trim(exercise);
    ALTER TABLE workout_exercises DROP COLUMN exercise, DROP COLUMN weight, DROP COLUMN unit,
      DROP COLUMN sets, DROP COLUMN reps;
    ALTER TABLE workout_exercises ADD CONSTRAINT workout_exercises_named
      CHECK (exercise_id IS NOT NULL OR legacy_name IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS exercise_sets_exercise_idx ON exercise_sets (workout_exercise_id, set_number);
-- Supersets: exercises in one session that share a superset_id are done back to back, alternating
-- sets. The id only groups rows inside its session (queries always scope by session_id), so no
-- separate table is needed; the timeline of alternating sets comes from exercise_sets.created_at.
-- A group always has at least two exercises: the API clears the id when only one remains.
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS superset_id UUID;
CREATE INDEX IF NOT EXISTS workout_exercises_superset_idx ON workout_exercises (session_id, superset_id) WHERE superset_id IS NOT NULL;
-- Custom foods describe one serving. Diary entries retain independent snapshots.
CREATE TABLE IF NOT EXISTS custom_foods (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  calories INTEGER NOT NULL CHECK (calories BETWEEN 0 AND 100000),
  protein DOUBLE PRECISION CHECK (protein BETWEEN 0 AND 100000),
  carbs DOUBLE PRECISION CHECK (carbs BETWEEN 0 AND 100000),
  fat DOUBLE PRECISION CHECK (fat BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_foods_account_idx ON custom_foods (account_id, created_at);
-- One weight per account and date; preserve the unit entered for that snapshot.
CREATE TABLE IF NOT EXISTS weight_entries (
  account_id UUID NOT NULL REFERENCES users(id),
  entry_date DATE NOT NULL,
  weight DOUBLE PRECISION NOT NULL CHECK (weight > 0),
  unit TEXT NOT NULL CHECK (unit IN ('lb', 'kg')),
  CHECK ((unit = 'kg' AND weight <= 1500) OR (unit = 'lb' AND weight <= 3307)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, entry_date)
);
