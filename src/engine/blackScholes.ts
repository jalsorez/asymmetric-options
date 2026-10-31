import type { OptType } from './types';

const MS_PER_DAY = 86_400_000;

/** Standard normal CDF (Hart / West algorithm, ~1e-15 accuracy). */
export function normCdf(x: number): number {
  const z = Math.abs(x);
  let c: number;
  if (z > 37) {
    c = 0;
  } else {
    const e = Math.exp(-(z * z) / 2);
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-2 * z + 0.700383064443688;
      n = n * z + 6.37396220353165;
      n = n * z + 33.912866078383;
      n = n * z + 112.079291497871;
      n = n * z + 221.213596169931;
      n = n * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      c = (e * n) / d;
    } else {
      const b = z + 1 / (z + 2 / (z + 3 / (z + 4 / (z + 0.65))));
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

export function normPdf(x: number): number {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

export function parseDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** Year fraction between two ISO dates (ACT/365), never negative. */
export function yearFrac(fromIso: string, toIso: string): number {
  return Math.max(0, (parseDate(toIso) - parseDate(fromIso)) / MS_PER_DAY / 365);
}

export function addDays(iso: string, days: number): string {
  return new Date(parseDate(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function intrinsic(type: OptType, S: number, K: number): number {
  return type === 'C' ? Math.max(S - K, 0) : Math.max(K - S, 0);
}

/** Black-Scholes-Merton price with continuous dividend yield q. */
export function bsPrice(type: OptType, S: number, K: number, T: number, r: number, q: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0) {
    // At (or past) expiry, or degenerate vol: discounted forward intrinsic.
    if (T <= 0 || S <= 0) return intrinsic(type, Math.max(S, 0), K);
    const fwd = S * Math.exp(-q * T) - K * Math.exp(-r * T);
    return type === 'C' ? Math.max(fwd, 0) : Math.max(-fwd, 0);
  }
  const sqT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * sqT);
  const d2 = d1 - sigma * sqT;
  const dfq = Math.exp(-q * T);
  const dfr = Math.exp(-r * T);
  return type === 'C'
    ? S * dfq * normCdf(d1) - K * dfr * normCdf(d2)
    : K * dfr * normCdf(-d2) - S * dfq * normCdf(-d1);
}

export interface Greeks {
  delta: number;
  gamma: number;
  /** Per calendar day. */
  theta: number;
  /** Per 1 vol point (0.01). */
  vega: number;
}

export function bsGreeks(type: OptType, S: number, K: number, T: number, r: number, q: number, sigma: number): Greeks {
  if (T <= 0 || sigma <= 0 || S <= 0) {
    const itm = type === 'C' ? S > K : S < K;
    return { delta: itm ? (type === 'C' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sqT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * sqT);
  const d2 = d1 - sigma * sqT;
  const dfq = Math.exp(-q * T);
  const dfr = Math.exp(-r * T);
  const pdf = normPdf(d1);
  const gamma = (dfq * pdf) / (S * sigma * sqT);
  const vega = (S * dfq * pdf * sqT) / 100;
  let delta: number;
  let thetaYear: number;
  if (type === 'C') {
    delta = dfq * normCdf(d1);
    thetaYear = (-S * dfq * pdf * sigma) / (2 * sqT) - r * K * dfr * normCdf(d2) + q * S * dfq * normCdf(d1);
  } else {
    delta = -dfq * normCdf(-d1);
    thetaYear = (-S * dfq * pdf * sigma) / (2 * sqT) + r * K * dfr * normCdf(-d2) - q * S * dfq * normCdf(-d1);
  }
  return { delta, gamma, theta: thetaYear / 365, vega };
}

/**
 * Implied volatility by bisection. Returns NaN when the price is outside
 * the no-arbitrage bounds (e.g. below intrinsic value).
 */
export function impliedVol(type: OptType, price: number, S: number, K: number, T: number, r: number, q: number): number {
  if (!(price > 0) || !(S > 0) || !(K > 0) || T <= 0) return NaN;
  let lo = 1e-4;
  let hi = 5;
  if (price < bsPrice(type, S, K, T, r, q, lo) - 1e-9) return NaN;
  if (price > bsPrice(type, S, K, T, r, q, hi)) return NaN;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (bsPrice(type, S, K, T, r, q, mid) > price) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-7) break;
  }
  return (lo + hi) / 2;
}
