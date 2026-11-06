import { getSql } from "@/lib/db";
import { MODEL_CALL_CAP, RESERVE_CALL_SQL, utcDay, withinDailyCap } from "./quota";

/** Reserve one model call for this user today. False when the daily cap is already used. */
export async function takeModelCall(userId: string, now = new Date()) {
  const sql = await getSql();
  const rows = await sql.query<{ calls: number }>(RESERVE_CALL_SQL, [userId, utcDay(now), MODEL_CALL_CAP]);
  return withinDailyCap(rows[0]?.calls);
}