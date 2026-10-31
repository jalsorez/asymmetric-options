import { bsPrice, intrinsic, yearFrac } from './blackScholes';
import { extremes } from './payoff';
import type { Leg, Market } from './types';

/**
 * Simplified Interactive Brokers Reg T margin model.
 *
 * - Short options covered by a long option of the same type (same or later expiry) form
 *   defined-risk groups; their requirement is the group's maximum loss.
 * - Short calls left over can be covered by long stock (covered call): no extra requirement.
 * - Remaining short options are naked: premium + max(20 % · S − OTM, 10 % · S for calls / 10 % · K for puts).
 * - Stock: 50 % initial, 25 % maintenance for long; 30 % for short.
 *
 * It is an estimate; Portfolio Margin accounts usually need less.
 */

const STOCK_INITIAL = 0.5;
const STOCK_MAINT_LONG = 0.25;
const STOCK_SHORT = 0.3;

interface Unit {
  leg: Leg;
  qty: number; // signed contracts (or shares for stock)
}

export interface MarginSplit {
  /** Long options + covered shorts (defined risk). */
  covered: Leg[];
  /** Short options with no cover (one leg per uncovered quantity). */
  naked: Leg[];
  /** Short calls covered by long stock. */
  stockCovered: Leg[];
  stock: Leg[];
}

function cloneQty(l: Leg, qty: number): Leg {
  return { ...l, qty };
}

export function splitForMargin(legs: Leg[], multiplier: number): MarginSplit {
  const covered: Leg[] = [];
  const naked: Leg[] = [];
  const stockCovered: Leg[] = [];
  const stock = legs.filter((l) => l.kind === 'stock');
  let stockSharesForCalls = stock.filter((l) => l.qty > 0).reduce((a, l) => a + l.qty, 0);

  for (const type of ['C', 'P'] as const) {
    const opts = legs.filter((l) => l.kind === 'option' && l.type === type);
    const longs: Unit[] = opts.filter((l) => l.qty > 0).map((l) => ({ leg: l, qty: l.qty }));
    const shorts: Unit[] = opts.filter((l) => l.qty < 0).map((l) => ({ leg: l, qty: -l.qty }));
    longs.forEach((u) => covered.push(cloneQty(u.leg, u.qty)));
    // Best cover first: lowest-strike long call / highest-strike long put.
    longs.sort((a, b) => (type === 'C' ? a.leg.strike - b.leg.strike : b.leg.strike - a.leg.strike));
    for (const s of shorts) {
      let remaining = s.qty;
      for (const l of longs) {
        if (remaining <= 0) break;
        if (l.qty <= 0 || l.leg.expiry < s.leg.expiry) continue;
        const take = Math.min(l.qty, remaining);
        l.qty -= take;
        remaining -= take;
        covered.push(cloneQty(s.leg, -take));
      }
      if (remaining > 0 && type === 'C' && stockSharesForCalls >= multiplier) {
        const take = Math.min(remaining, Math.floor(stockSharesForCalls / multiplier));
        stockSharesForCalls -= take * multiplier;
        remaining -= take;
        stockCovered.push(cloneQty(s.leg, -take));
      }
      if (remaining > 0) naked.push(cloneQty(s.leg, -remaining));
    }
  }
  return { covered, naked, stockCovered, stock };
}

/** Reg T add-on (beyond the option's own value) per share for a naked short. */
export function nakedAddOn(type: 'C' | 'P', S: number, K: number): number {
  const otm = type === 'C' ? Math.max(K - S, 0) : Math.max(S - K, 0);
  return Math.max(0.2 * S - otm, 0.1 * (type === 'C' ? S : K));
}

function optionMark(l: Leg, market: Market, S: number, dateIso: string, ivShift: number): number {
  const T = yearFrac(dateIso, l.expiry);
  return T <= 0 ? intrinsic(l.type, S, l.strike) : bsPrice(l.type, S, l.strike, T, market.rate, market.dividend, Math.max(1e-4, l.iv + ivShift));
}

export interface MarginResult {
  /** Requirement as the broker would display it ($). */
  requirement: number;
  /** Reduction of excess liquidity versus not having the trade ($). */
  liquidityImpact: number;
  definedRiskPart: number;
  nakedPart: number;
  stockPart: number;
  nakedCount: number;
}

/**
 * Margin at underlying price S on a date (use the valuation date and spot for the opening figure,
 * a shocked price for stress tests).
 */
export function marginAt(legs: Leg[], market: Market, S: number, dateIso: string, ivShift = 0, opening = false): MarginResult {
  const m = market.multiplier;
  const split = splitForMargin(legs, m);

  // Defined-risk group: its max loss is locked in and does not move with the price.
  let definedRiskPart = 0;
  if (split.covered.length > 0) {
    const horizon = split.covered.reduce((a, l) => (l.expiry < a ? l.expiry : a), split.covered[0].expiry);
    definedRiskPart = extremes(split.covered, market, horizon).maxLoss;
  }

  let nakedPart = 0;
  let nakedImpact = 0;
  for (const l of split.naked) {
    const n = -l.qty * m;
    const mark = optionMark(l, market, S, dateIso, ivShift);
    const add = nakedAddOn(l.type, S, l.strike);
    nakedPart += (mark + add) * n;
    // Cash received at open offsets part of the requirement; losses reduce equity.
    nakedImpact += (mark + add - l.price) * n;
  }

  let stockPart = 0;
  let stockImpact = 0;
  // P&L of the stock plus the calls it covers.
  const stockPnl = (S0: number) =>
    split.stock.reduce((a, l) => a + l.qty * (S0 - l.price), 0) +
    split.stockCovered.reduce((a, l) => a + l.qty * m * (optionMark(l, market, S0, dateIso, ivShift) - l.price), 0);
  for (const l of split.stock) {
    const rate = l.qty > 0 ? (opening ? STOCK_INITIAL : STOCK_MAINT_LONG) : STOCK_SHORT;
    stockPart += rate * Math.abs(l.qty) * S;
  }
  if (split.stock.length > 0) {
    // Buying stock on margin: the requirement is a share of the value, and losses come off equity.
    const pnl = stockPnl(S);
    stockImpact = stockPart - pnl;
  }

  return {
    requirement: definedRiskPart + nakedPart + stockPart,
    liquidityImpact: definedRiskPart + nakedImpact + stockImpact,
    definedRiskPart,
    nakedPart,
    stockPart,
    nakedCount: split.naked.reduce((a, l) => a - l.qty, 0),
  };
}
