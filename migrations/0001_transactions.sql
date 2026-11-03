CREATE TABLE transactions (
  user_id TEXT NOT NULL CHECK(length(user_id) > 0),
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
  date TEXT NOT NULL CHECK(date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  kind TEXT NOT NULL CHECK(kind IN ('haircut','tip','rent','supplies','other')),
  amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount > 0 AND amount <= 9007199254740991),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 160),
  PRIMARY KEY(user_id,id)
);
CREATE INDEX transactions_owner_date ON transactions(user_id,date);
