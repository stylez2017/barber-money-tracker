CREATE TABLE billing_accounts (
  user_id TEXT PRIMARY KEY NOT NULL,
  billing_key TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  checkout_key TEXT NOT NULL,
  checkout_session_id TEXT,
  checkout_expires_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE billing_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  price_id TEXT NOT NULL,
  paid_through INTEGER NOT NULL DEFAULT 0,
  event_created INTEGER NOT NULL,
  refreshed_at INTEGER NOT NULL
);
CREATE INDEX billing_subscription_owner ON billing_subscriptions(user_id);
CREATE TABLE billing_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  event_created INTEGER NOT NULL,
  processed_at INTEGER NOT NULL
);
CREATE TABLE billing_holds (
  charge_id TEXT PRIMARY KEY NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  blocked INTEGER NOT NULL CHECK(blocked IN (0,1)),
  event_created INTEGER NOT NULL
);
CREATE INDEX billing_holds_customer ON billing_holds(stripe_customer_id,blocked);
