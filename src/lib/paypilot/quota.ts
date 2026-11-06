export const MODEL_CALL_CAP = 20;

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** `used` is the count after a reservation. Missing means the cap refused the update. */
export function withinDailyCap(used: number | undefined, cap = MODEL_CALL_CAP) {
  return typeof used === "number" && used >= 1 && used <= cap;
}

/** Inserts the first call, then increments only while the count is still under the cap. */
export const RESERVE_CALL_SQL = `
insert into paypilot_model_use (user_id, day, calls)
values ($1, $2, 1)
on conflict (user_id, day) do update
  set calls = paypilot_model_use.calls + 1
  where paypilot_model_use.calls < $3
returning calls
`;
