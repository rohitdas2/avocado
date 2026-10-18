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
CREATE TABLE IF NOT EXISTS lift_entries (
  id UUID PRIMARY KEY,
  exercise TEXT NOT NULL CHECK (length(trim(exercise)) BETWEEN 1 AND 120),
  weight DOUBLE PRECISION NOT NULL CHECK (weight BETWEEN 0 AND 10000),
  unit TEXT NOT NULL CHECK (unit IN ('lb', 'kg')),
  sets INTEGER NOT NULL CHECK (sets BETWEEN 1 AND 100),
  reps INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 1000),
  entry_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lift_entries_date_idx ON lift_entries (entry_date);
ALTER TABLE lift_entries ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
CREATE INDEX IF NOT EXISTS lift_entries_account_date_idx ON lift_entries (account_id, entry_date);
