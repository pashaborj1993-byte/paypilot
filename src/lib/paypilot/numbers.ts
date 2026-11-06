export function invoiceNumber(next: number) {
  if (!Number.isInteger(next) || next < 1041) throw new Error("Invoice number was not allocated.");
  return `PP-${next}`;
}

/** Hands out the next number for a team. The first insert seeds from existing bills; later calls only increment. */
export const ALLOCATE_NUMBER_SQL = `
insert into paypilot_number (team_id, next_n)
select $1, greatest(
  1041,
  coalesce((
    select max(nullif(regexp_replace(number, '\\D', '', 'g'), '')::int)
    from paypilot_invoice
    where team_id = $1
  ), 1040) + 1
)
on conflict (team_id) do update set next_n = paypilot_number.next_n + 1
returning next_n
`;
