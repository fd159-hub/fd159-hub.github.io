-- Additive migration: preserve existing words, answers and progress.
UPDATE words SET image='3️⃣' WHERE spelling='three' AND image IS NULL;
UPDATE words SET image='🧢' WHERE spelling='cap' AND image IS NULL;
ALTER TABLE progress ADD COLUMN missed INTEGER NOT NULL DEFAULT 0;
UPDATE progress SET missed=1 WHERE wrong>0;
CREATE TABLE login_limits (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);
CREATE TABLE requests (
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response TEXT,
  PRIMARY KEY(user_id,request_id)
);
CREATE TABLE imports (
  id INTEGER PRIMARY KEY CHECK(id=1),
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
