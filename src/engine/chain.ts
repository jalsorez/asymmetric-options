import { impliedVol, yearFrac } from './blackScholes';
import type { Chain, ChainRow, Market, OptType, PriceMode, Quote } from './types';

export function quoteMid(q: Quote): number | null {
  if (q.bid != null && q.ask != null && q.ask >= q.bid && q.ask > 0) return (q.bid + q.ask) / 2;
  if (q.last != null && q.last > 0) return q.last;
  if (q.ask != null && q.ask > 0) return q.ask;
  if (q.bid != null && q.bid > 0) return q.bid;
  return null;
}

/** Fill price for opening a position: buyers pay the ask and sellers receive the bid in 'worst' mode. */
export function fillPrice(q: Quote, side: 'buy' | 'sell', mode: PriceMode): number | null {
  if (mode === 'mid') return quoteMid(q);
  if (mode === 'last') return q.last ?? quoteMid(q);
  const p = side === 'buy' ? q.ask : q.bid;
  return p != null && p > 0 ? p : quoteMid(q);
}

export function findRow(chain: Chain | undefined, strike: number): ChainRow | undefined {
  return chain?.rows.find((r) => Math.abs(r.strike - strike) < 1e-9);
}

export function sideQuote(row: ChainRow, type: OptType): Quote {
  return type === 'C' ? row.call : row.put;
}

/** Implied vol of one chain quote from its mid price. */
export function quoteIv(market: Market, expiry: string, strike: number, type: OptType, q: Quote): number {
  const mid = quoteMid(q);
  if (mid == null) return NaN;
  const T = yearFrac(market.valuationDate, expiry);
  return impliedVol(type, mid, market.spot, strike, T, market.rate, market.dividend);
}

/** Robust IV for a strike: mean of call and put IVs when both are valid (they should agree by parity). */
export function strikeIv(market: Market, chain: Chain, strike: number, type: OptType): number {
  const row = findRow(chain, strike);
  if (!row) return NaN;
  const own = quoteIv(market, chain.expiry, strike, type, sideQuote(row, type));
  if (Number.isFinite(own)) return own;
  const other = quoteIv(market, chain.expiry, strike, type === 'C' ? 'P' : 'C', sideQuote(row, type === 'C' ? 'P' : 'C'));
  return other;
}

/** ATM implied vol: average of valid IVs at the two strikes bracketing spot. */
export function atmIv(market: Market, chain: Chain | undefined): number {
  if (!chain || chain.rows.length === 0) return NaN;
  const sorted = [...chain.rows].sort((a, b) => Math.abs(a.strike - market.spot) - Math.abs(b.strike - market.spot));
  const ivs: number[] = [];
  for (const row of sorted.slice(0, 4)) {
    for (const t of ['C', 'P'] as const) {
      const v = quoteIv(market, chain.expiry, row.strike, t, sideQuote(row, t));
      if (Number.isFinite(v)) ivs.push(v);
    }
  }
  if (ivs.length === 0) return NaN;
  return ivs.reduce((a, b) => a + b, 0) / ivs.length;
}

export interface ParityResult {
  /** Spot implied with the user's rate (median over near-the-money strikes). */
  spot: number;
  /** Rate implied by a least-squares fit of C − P against K (noisy; informative only). */
  impliedRate: number | null;
  strikesUsed: number;
}

/**
 * Implied spot from put-call parity: C − P = S·e^(−qT) − K·e^(−rT).
 * Uses the strikes where C − P is closest to zero (near the money), where quotes are most reliable.
 */
export function impliedSpot(chain: Chain, rate: number, dividend: number, valuationDate: string): ParityResult | null {
  const T = yearFrac(valuationDate, chain.expiry);
  if (T <= 0) return null;
  const pts = chain.rows
    .map((r) => {
      const c = quoteMid(r.call);
      const p = quoteMid(r.put);
      return c != null && p != null ? { K: r.strike, d: c - p } : null;
    })
    .filter((x): x is { K: number; d: number } => x != null)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))
    .slice(0, 8);
  if (pts.length === 0) return null;
  const est = pts.map((p) => (p.d + p.K * Math.exp(-rate * T)) * Math.exp(dividend * T)).sort((a, b) => a - b);
  const m = Math.floor(est.length / 2);
  const spot = est.length % 2 ? est[m] : (est[m - 1] + est[m]) / 2;

  let impliedRate: number | null = null;
  if (pts.length >= 3) {
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p.K, 0) / n;
    const my = pts.reduce((a, p) => a + p.d, 0) / n;
    const sxx = pts.reduce((a, p) => a + (p.K - mx) ** 2, 0);
    if (sxx > 0) {
      const slope = pts.reduce((a, p) => a + (p.K - mx) * (p.d - my), 0) / sxx;
      const df = -slope;
      if (df > 0 && df < 1.5) impliedRate = -Math.log(df) / T;
    }
  }
  return { spot, impliedRate, strikesUsed: pts.length };
}

export function sortChain(chain: Chain): Chain {
  return { ...chain, rows: [...chain.rows].sort((a, b) => a.strike - b.strike) };
}

export function emptyQuote(): Quote {
  return { bid: null, ask: null, last: null, volume: null, oi: null };
}
