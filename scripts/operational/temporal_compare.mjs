import Decimal from 'decimal.js';

const temporalTypes = new Set(['timestamptz', 'timestamp', 'date']);
export const isTemporalType = type => temporalTypes.has(type);

function invalid(field) { throw Error('IMPORT_TEMPORAL_INVALID:' + field); }

export function canonicalTemporal(value, type, field = type) {
  if (!isTemporalType(type)) throw Error('IMPORT_TEMPORAL_TYPE_UNSUPPORTED:' + type);
  if (value === null) return null;
  if (value instanceof Date) {
    if (type === 'date' || !Number.isFinite(value.getTime())) invalid(field);
    // postgres.js represents a zone-less timestamp using UTC calendar fields.
    // Database comparisons use ::text instead, retaining all six fractional digits.
    value = value.toISOString();
    if (type === 'timestamp') value = value.slice(0, -1);
  }
  if (typeof value !== 'string') invalid(field);
  const pattern = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;
  const m = value.match(pattern);
  if (!m) invalid(field);
  const [, ys, ms, ds, hs, mins, ss, fraction = '', zone] = m;
  const y = Number(ys), month = Number(ms), day = Number(ds);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) invalid(field);
  if (type === 'date') {
    if (hs !== undefined) invalid(field);
    return `${ys}-${ms}-${ds}`;
  }
  if (hs === undefined || Number(hs) > 23 || Number(mins) > 59 || Number(ss) > 59) invalid(field);
  if (type === 'timestamp') {
    if (zone !== undefined) invalid(field);
    return `${ys}-${ms}-${ds}T${hs}:${mins}:${ss}.${fraction.padEnd(6, '0')}`;
  }
  if (!zone) invalid(field);
  let offset = 0;
  if (zone !== 'Z') {
    const z = zone.match(/^([+-])(\d{2})(?::?(\d{2}))?$/);
    const hours = Number(z[2]), minutes = Number(z[3] ?? 0);
    if (hours > 15 || minutes > 59) invalid(field);
    offset = (hours * 60 + minutes) * (z[1] === '-' ? -1 : 1);
  }
  const clock = new Date(0);
  clock.setUTCFullYear(y, month - 1, day);
  clock.setUTCHours(Number(hs), Number(mins), Number(ss), 0);
  return BigInt(clock.getTime()) * 1000n + BigInt(fraction.padEnd(6, '0')) - BigInt(offset) * 60000000n;
}

export function masterValuesEqual(a, b, type, field) {
  if (isTemporalType(type)) return canonicalTemporal(a, type, field) === canonicalTemporal(b, type, field);
  if (a == null && b == null) return true;
  if (type === 'numeric') {
    const exact = value => {
      if (value === null) return null;
      if (!['string', 'number'].includes(typeof value) ||
        typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value) ||
        !/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(value)))
        throw Error('IMPORT_NUMERIC_INVALID:' + field);
      const n = new Decimal(value);
      if (!n.isFinite()) throw Error('IMPORT_NUMERIC_INVALID:' + field);
      return n;
    };
    const left = exact(a), right = exact(b);
    return left === null || right === null ? left === right : left.eq(right);
  }
  return String(a) === String(b);
}
