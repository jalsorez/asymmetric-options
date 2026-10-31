import { bsGreeks, bsPrice, intrinsic, normCdf, parseDate, yearFrac } from './blackScholes';
import type { Leg, Market } from './types';

/** Cash paid to open the position (positive = debit, negative = credit). */
export function netCost(legs: Leg[], multiplier: number): number {
  return legs.reduce((a, l) => a + legCost(l, multiplier), 0);
}

export function legCost(l: Leg, multiplier: number): number {
  return l.kind === 'stock' ? l.qty * l.price : l.qty * l.price * multiplier;
}

/** Analysis horizon: the earliest option expiry (or one year out when there are no options). */
export function horizonDate(legs: Leg[], market: Market): string {
  const exps = legs.filter((l) => l.kind === 'option' && l.expiry).map((l) => l.expiry);
  if (exps.length === 0) {
    const d = new Date(parseDate(market.valuationDate));
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }
  return exps.reduce((a, b) => (parseDate(a) <= parseDate(b) ? a : b));
}

/** Mark-to-model value of one leg at underlying price S on a given date. */
export function legValue(l: Leg, market: Market, S: number, dateIso: string, ivShift = 0): number {
  if (l.kind === 'stock') return l.qty * S;
  const T = yearFrac(dateIso, l.expiry);
  const per = T <= 0
    ? intrinsic(l.type, S, l.strike)
    : bsPrice(l.type, S, l.strike, T, market.rate, market.dividend, Math.max(0.0001, l.iv + ivShift));
  return l.qty * per * market.multiplier;
}

export function positionValue(legs: Leg[], market: Market, S: number, dateIso: string, ivShift = 0): number {
  return legs.reduce((a, l) => a + legValue(l, market, S, dateIso, ivShift), 0);
}

/** Profit/loss of the whole position in $ at price S on a date. */
export function pnlAt(legs: Leg[], market: Market, S: number, dateIso: string, ivShift = 0): number {
  return positionValue(legs, market, S, dateIso, ivShift) - netCost(legs, market.multiplier);
}

export function strikesOf(legs: Leg[]): number[] {
  return [...new Set(legs.filter((l) => l.kind === 'option').map((l) => l.strike))].sort((a, b) => a - b);
}

/** Upper bound of the price grid used for extrema and breakeven searches. */
export function gridUpper(legs: Leg[], spot: number): number {
  const ks = strikesOf(legs);
  return Math.max(spot * 4, (ks[ks.length - 1] ?? 0) * 2.5, 1);
}

export interface Extremes {
  maxProfit: number;
  maxLoss: number; // positive number = loss amount
  unlimitedProfit: boolean;
  unlimitedLoss: boolean;
}

export function extremes(legs: Leg[], market: Market, dateIso: string): Extremes {
  const upper = gridUpper(legs, market.spot);
  const pts = new Set<number>([0, market.spot, upper, ...strikesOf(legs)]);
  const N = 600;
  for (let i = 1; i < N; i++) pts.add((upper * i) / N);
  let max = -Infinity;
  let min = Infinity;
  for (const S of pts) {
    const v = pnlAt(legs, market, S, dateIso);
    if (v > max) max = v;
    if (v < min) min = v;
  }
  // Behaviour beyond the grid: compare the slope at the far right.
  const a = pnlAt(legs, market, upper, dateIso);
  const b = pnlAt(legs, market, upper * 2, dateIso);
  const slope = (b - a) / upper;
  const tol = 1e-6 * market.multiplier;
  return {
    maxProfit: max,
    maxLoss: Math.max(0, -min),
    unlimitedProfit: slope > tol,
    unlimitedLoss: slope < -tol,
  };
}

/** Prices where the P&L at the date crosses zero. */
export function breakevens(legs: Leg[], market: Market, dateIso: string): number[] {
  const upper = gridUpper(legs, market.spot);
  const N = 2000;
  const res: number[] = [];
  const f = (S: number) => pnlAt(legs, market, S, dateIso);
  let prevS = 0;
  let prev = f(0);
  for (let i = 1; i <= N; i++) {
    const S = (upper * i) / N;
    const v = f(S);
    if (prev === 0 && i > 1) res.push(prevS);
    else if ((prev < 0 && v > 0) || (prev > 0 && v < 0)) {
      let lo = prevS;
      let hi = S;
      for (let k = 0; k < 60; k++) {
        const m = (lo + hi) / 2;
        const fm = f(m);
        if ((fm < 0) === (prev < 0)) lo = m;
        else hi = m;
      }
      res.push((lo + hi) / 2);
    }
    prevS = S;
    prev = v;
  }
  // Collapse near-duplicates (flat zero segments).
  return res.filter((x, i) => i === 0 || Math.abs(x - res[i - 1]) > upper / N);
}

/** Risk-neutral probability that the underlying ends above x at time T (lognormal). */
export function probAbove(x: number, market: Market, T: number, sigma: number): number {
  if (x <= 0) return 1;
  if (T <= 0 || !(sigma > 0)) return market.spot > x ? 1 : 0;
  const mu = Math.log(market.spot) + (market.rate - market.dividend - (sigma * sigma) / 2) * T;
  return 1 - normCdf((Math.log(x) - mu) / (sigma * Math.sqrt(T)));
}

/** Probability of finishing with a profit at the horizon. */
export function probProfit(legs: Leg[], market: Market, dateIso: string, sigma: number): number {
  const T = yearFrac(market.valuationDate, dateIso);
  const bes = breakevens(legs, market, dateIso);
  const edges = [0, ...bes, Infinity];
  let p = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i];
    const b = edges[i + 1];
    const mid = b === Infinity ? Math.max(a * 1.2, a + 1) : (a + b) / 2;
    if (pnlAt(legs, market, mid, dateIso) > 0) {
      p += probAbove(a, market, T, sigma) - (b === Infinity ? 0 : probAbove(b, market, T, sigma));
    }
  }
  return Math.min(1, Math.max(0, p));
}

export interface PositionGreeks {
  /** Equivalent number of shares. */
  delta: number;
  gamma: number;
  /** $ per calendar day. */
  theta: number;
  /** $ per vol point. */
  vega: number;
}

export function positionGreeks(legs: Leg[], market: Market): PositionGreeks {
  const g: PositionGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  for (const l of legs) {
    if (l.kind === 'stock') {
      g.delta += l.qty;
      continue;
    }
    const T = yearFrac(market.valuationDate, l.expiry);
    const x = bsGreeks(l.type, market.spot, l.strike, T, market.rate, market.dividend, l.iv);
    const m = l.qty * market.multiplier;
    g.delta += x.delta * m;
    g.gamma += x.gamma * m;
    g.theta += x.theta * m;
    g.vega += x.vega * m;
  }
  return g;
}
