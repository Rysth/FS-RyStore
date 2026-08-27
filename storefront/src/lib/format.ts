// Prices come from the API as decimal strings — always format through here.
export function formatPrice(
  value: string | number | null | undefined,
): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

export function pluralize(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
