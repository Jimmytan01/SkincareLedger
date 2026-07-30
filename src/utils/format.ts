/**
 * Formats a number with Indonesian thousand separators (dot as thousand separator).
 * Example: 32411 -> "32.411"
 */
export function formatQty(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0'
  return new Intl.NumberFormat('id-ID').format(val)
}
