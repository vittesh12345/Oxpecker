import type { Unit } from './types';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function plain(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
}

export function formatValue(unit: Unit, n: number): string {
  switch (unit) {
    case 'money':
      return money.format(n);
    case 'rate':
      return `${money.format(n)}/hr`;
    case 'hours':
      return `${plain(n)} h`;
    case 'count':
      return plain(n);
  }
}

/** Signed change, using a real minus sign. Returns '' when nothing changed. */
export function formatDelta(unit: Unit, delta: number): string {
  if (Math.abs(delta) < 0.005) return '';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${formatValue(unit, Math.abs(delta))}`;
}

/** Average month from a weekly figure (52 weeks over 12 months). */
export function monthly(weekly: number): number {
  return Math.round(((weekly * 52) / 12) * 100) / 100;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
