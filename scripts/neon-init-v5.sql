-- Password reset tokens (run after neon-init-v4 if applicable)
-- Neon dashboard → SQL Editor → paste → Run

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id serial PRIMARY KEY NOT NULL,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at text NOT NULL,
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_hash ON password_reset_tokens (token_hash);
