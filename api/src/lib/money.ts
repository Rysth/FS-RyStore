/**
 * Decimal money arithmetic, in integer cents.
 *
 * Every price column in the schema is `numeric(10, 2)`, which the pg driver
 * hands back as a string ("12.50"), and Drizzle passes through unchanged.
 * Rails did this arithmetic in BigDecimal. There is no BigDecimal here, and
 * `parseFloat` is not a substitute: 0.1 + 0.2 is 0.30000000000000004, and a
 * cart that multiplies and sums a few dozen of those drifts by a cent — on a
 * total the shop then reads out loud over WhatsApp.
 *
 * So amounts are parsed once into `bigint` cents, all arithmetic happens
 * there, and the result is formatted back to a "0.00" string on the way to the
 * database or the API. Nothing outside this module should touch a price with
 * `Number`, `parseFloat` or `toFixed`.
 */

/** An amount of money, held as a whole number of cents. */
export type Cents = bigint;

export const ZERO: Cents = 0n;

/**
 * Parses a decimal string (or a number, for literals in tests and seeds) into
 * cents, rounding half away from zero — the same rule Rails' `.round(2)` used.
 * Returns 0 for null/undefined/blank so a nullable column reads as "nothing".
 */
export function toCents(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined) return ZERO;

  const text = typeof value === "number" ? value.toString() : value.trim();
  if (text === "") return ZERO;

  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) throw new TypeError(`Importe no numérico: ${JSON.stringify(value)}`);

  const [, sign, whole = "", fraction = ""] = match;
  if (whole === "" && fraction === "") throw new TypeError(`Importe no numérico: ${JSON.stringify(value)}`);

  // Keep two decimals, and let the third decide the rounding.
  const padded = (fraction + "000").slice(0, 3);
  let cents = BigInt(whole || "0") * 100n + BigInt(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1n;

  return sign === "-" ? -cents : cents;
}

/** Formats cents back to the "0.00" string shape the database and API use. */
export function fromCents(cents: Cents): string {
  const negative = cents < ZERO;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function addCents(...amounts: Cents[]): Cents {
  return amounts.reduce<Cents>((total, amount) => total + amount, ZERO);
}

export function subtractCents(minuend: Cents, subtrahend: Cents): Cents {
  return minuend - subtrahend;
}

/**
 * Multiplies an amount by a whole quantity. Quantities are always integers
 * here (you cannot order 1.5 units), so this is exact — no rounding needed.
 */
export function multiplyCents(amount: Cents, quantity: number): Cents {
  if (!Number.isInteger(quantity)) {
    throw new TypeError(`La cantidad debe ser un entero: ${quantity}`);
  }
  return amount * BigInt(quantity);
}

/**
 * Applies a percentage, rounding half away from zero. Used for percentage
 * coupons, where Rails computed `subtotal * value / 100` in BigDecimal and
 * then rounded to 2 decimals.
 */
export function percentOfCents(amount: Cents, percent: string | number): Cents {
  // percent carries at most 2 decimals (numeric(10,2)), so scale by 100 to
  // stay in integers: amount * (percent * 100) / (100 * 100).
  const scaledPercent = toCents(percent);
  const numerator = amount * scaledPercent;
  const denominator = 10_000n;

  const negative = numerator < ZERO;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

export function minCents(a: Cents, b: Cents): Cents {
  return a < b ? a : b;
}

export function maxCents(a: Cents, b: Cents): Cents {
  return a > b ? a : b;
}

/** Clamps at zero — an order total is never negative. */
export function clampAtZero(amount: Cents): Cents {
  return amount < ZERO ? ZERO : amount;
}

export function isPositive(amount: Cents): boolean {
  return amount > ZERO;
}

/**
 * For display only (charts, report aggregates, the dashboard). Never feed the
 * result back into a calculation or into the database.
 */
export function centsToNumber(cents: Cents): number {
  return Number(cents) / 100;
}
