create table if not exists paypilot_number (
  team_id text primary key,
  next_n integer not null
);

create table if not exists paypilot_model_use (
  user_id text not null,
  day text not null,
  calls integer not null,
  primary key (user_id, day)
);
