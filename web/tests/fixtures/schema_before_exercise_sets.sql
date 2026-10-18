CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  email TEXT UNIQUE CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(trim(email))),
  password TEXT CHECK (password ~ '^sha512[$][0-9a-f]{32}[$][0-9a-f]{128}$'),
  is_guest BOOLEAN NOT NULL DEFAULT false,
  CHECK ((is_guest AND email IS NULL AND password IS NULL) OR (NOT is_guest AND email IS NOT NULL AND password IS NOT NULL)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS account_sessions (
  token_digest TEXT PRIMARY KEY CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
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
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
CREATE INDEX IF NOT EXISTS food_entries_account_date_idx ON food_entries (account_id, entry_date);
CREATE TABLE IF NOT EXISTS workouts (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  entry_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workouts_account_date_idx ON workouts (account_id, entry_date);
CREATE UNIQUE INDEX IF NOT EXISTS workouts_current_idx ON workouts (account_id) WHERE is_current;
-- Rename the old exercise table in place, retaining IDs and precise timestamps.
DO $$ BEGIN
  IF to_regclass('lift_entries') IS NOT NULL AND to_regclass('workout_exercises') IS NULL THEN
    ALTER TABLE lift_entries RENAME TO workout_exercises;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS workout_exercises (
  id UUID PRIMARY KEY,
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL CHECK (length(trim(exercise)) BETWEEN 1 AND 120),
  weight DOUBLE PRECISION NOT NULL CHECK (weight BETWEEN 0 AND 10000),
  unit TEXT NOT NULL CHECK (unit IN ('lb', 'kg')),
  sets INTEGER NOT NULL CHECK (sets BETWEEN 1 AND 100),
  reps INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Legacy rows had no workout boundary: preserve one historical workout per owner/day.
-- Unowned legacy data stays unowned and inaccessible; never assign it to a guest.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'workout_exercises' AND column_name = 'entry_date') THEN
    ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
    ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS workout_id UUID REFERENCES workouts(id) ON DELETE CASCADE;
    INSERT INTO workouts (id, account_id, name, entry_date, created_at)
      SELECT (array_agg(id ORDER BY created_at, id))[1], account_id, 'Workout', entry_date, min(created_at)
      FROM workout_exercises GROUP BY account_id, entry_date;
    UPDATE workout_exercises e SET workout_id = w.id FROM workouts w
      WHERE w.account_id IS NOT DISTINCT FROM e.account_id AND w.entry_date = e.entry_date;
    ALTER TABLE workout_exercises ALTER COLUMN workout_id SET NOT NULL;
    ALTER TABLE workout_exercises DROP COLUMN account_id, DROP COLUMN entry_date;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS workout_exercises_workout_idx ON workout_exercises (workout_id, created_at);
-- Custom foods describe one serving. Diary entries retain independent snapshots.
CREATE TABLE IF NOT EXISTS custom_foods (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
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
  account_id UUID NOT NULL REFERENCES accounts(id),
  entry_date DATE NOT NULL,
  weight DOUBLE PRECISION NOT NULL CHECK (weight > 0),
  unit TEXT NOT NULL CHECK (unit IN ('lb', 'kg')),
  CHECK ((unit = 'kg' AND weight <= 1500) OR (unit = 'lb' AND weight <= 3307)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, entry_date)
);
