-- Independent teacher overrides preserve existing automatic unlock progress.
CREATE TABLE stage_access (
  user_id TEXT NOT NULL REFERENCES users(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('listen','tiles','missing','picture','dictation','review')),
  allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
  PRIMARY KEY(user_id,lesson_id,mode)
);
