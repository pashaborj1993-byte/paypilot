create table if not exists paypilot_team (
  id text primary key,
  name text not null,
  owner_user_id text not null
);

create table if not exists paypilot_member (
  team_id text not null,
  email text not null,
  user_id text,
  role text not null,
  primary key (team_id, email)
);

create index if not exists paypilot_member_user_idx on paypilot_member (user_id);

create table if not exists paypilot_invoice (
  id text primary key,
  team_id text not null,
  number text not null,
  recipient_email text not null,
  recipient_name text not null,
  items text not null,
  currency text not null,
  note text not null,
  status text not null,
  created_at timestamptz not null default now(),
  reminded_at timestamptz,
  paid_at timestamptz,
  paypal_id text,
  paypal_url text,
  unique (team_id, number)
);

create index if not exists paypilot_invoice_paypal_idx on paypilot_invoice (paypal_id);

create table if not exists paypilot_webhook (
  id text primary key,
  url text not null,
  paypal_id text not null
);
