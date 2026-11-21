/**
 * Converts a quantity in the selected UoM into integer base units (MP-INV-002).
 */
export function toBaseUnits(qty: number, factorToBase: number): number {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Quantity must be a positive integer');
  }
  if (!Number.isInteger(factorToBase) || factorToBase <= 0) {
    throw new Error('Conversion factor must be a positive integer');
  }
  return qty * factorToBase;
}

/**
 * Converts a base-unit quantity down to whole units of the given factor.
 */
export function fromBaseUnits(baseQty: number, factorToBase: number): number {
  if (!Number.isInteger(factorToBase) || factorToBase <= 0) {
    throw new Error('Conversion factor must be a positive integer');
  }
  return Math.floor(Math.max(baseQty, 0) / factorToBase);
}

/**
 * Validates PAR level invariant: 0 <= min <= par <= max (MP-INV-005).
 */
export function validateParLevels(minQty: number, parQty: number, maxQty: number): boolean {
  return (
    Number.isInteger(minQty) &&
    Number.isInteger(parQty) &&
    Number.isInteger(maxQty) &&
    minQty >= 0 &&
    minQty <= parQty &&
    parQty <= maxQty
  );
}

export function formatUomConversion(
  qty: number,
  unit: string,
  factorToBase: number,
  baseUnit: string,
): string {
  const safeQty = Number.isFinite(qty) && qty > 0 ? Math.trunc(qty) : 0;
  const totalBase = safeQty * factorToBase;
  if (factorToBase === 1 || unit === baseUnit) {
    return `${safeQty} ${baseUnit}`;
  }
  return `${safeQty} ${unit} = ${totalBase} ${baseUnit}`;
}
