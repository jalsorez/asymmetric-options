import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_CONFIG } from '../src/engine/analysis';
import { bsPrice, impliedVol, normCdf } from '../src/engine/blackScholes';
import { impliedSpot, quoteIv } from '../src/engine/chain';
import { marginAt } from '../src/engine/margin';
import { breakevens, extremes, netCost, pnlAt } from '../src/engine/payoff';
import { buildLegs } from '../src/engine/strategies';
import type { Chain, Leg, Market } from '../src/engine/types';
import { parseChain } from '../src/parse/chainParser';
import { GOOGL_DEC28, MSTR_DEC28, MSTR_ONE_CELL_PER_LINE } from './fixtures';

const EXP = '2028-12-15';
const mstrChain: Chain = { expiry: EXP, rows: parseChain(MSTR_DEC28).rows };
const googlChain: Chain = { expiry: EXP, rows: parseChain(GOOGL_DEC28).rows };

const mstr: Market = { ticker: 'MSTR', spot: 140, rate: 0.035, dividend: 0, valuationDate: '2026-10-16', multiplier: 100 };
const googl: Market = { ticker: 'GOOGL', spot: 275, rate: 0.04, dividend: 0.003, valuationDate: '2026-10-31', multiplier: 100 };

let n = 0;
function opt(type: 'C' | 'P', strike: number, qty: number, price: number, iv = 0.5): Leg {
  return { id: `t${n++}`, kind: 'option', type, strike, expiry: EXP, qty, price, iv };
}

describe('black-scholes', () => {
  it('normCdf', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 12);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021, 6);
  });
  it('implied vol round-trips', () => {
    const p = bsPrice('C', 100, 110, 1.5, 0.04, 0.01, 0.37);
    expect(impliedVol('C', p, 100, 110, 1.5, 0.04, 0.01)).toBeCloseTo(0.37, 5);
  });
});

describe('parser', () => {
  it('parses broker layout with tabs and arrows', () => {
    const r = parseChain(MSTR_DEC28);
    expect(r.format).toBe('broker');
    expect(r.rows).toHaveLength(14);
    const k150 = r.rows.find((x) => x.strike === 150)!;
    expect(k150.call).toMatchObject({ last: 55, bid: 54.1, ask: 56.95, volume: 539, oi: 2383 });
    expect(k150.put).toMatchObject({ last: 53.1, bid: 53.3, ask: 56.75, volume: null, oi: 474 });
  });
  it('parses one cell per line', () => {
    const r = parseChain(MSTR_ONE_CELL_PER_LINE);
    expect(r.rows.map((x) => x.strike)).toEqual([120, 125]);
    expect(r.rows[1].call.ask).toBe(65.9);
  });
  it('parses space separated GOOGL rows', () => {
    const r = parseChain(GOOGL_DEC28);
    expect(r.rows).toHaveLength(14);
    expect(r.rows.find((x) => x.strike === 400)!.call.bid).toBe(29.55);
  });
  it('parses CSV with headers', () => {
    const r = parseChain('strike,call_bid,call_ask,put_bid,put_ask\n100,5,5.5,4,4.4\n110,2,2.2,9,9.5');
    expect(r.format).toBe('header');
    expect(r.rows[1]).toMatchObject({ strike: 110, call: { bid: 2, ask: 2.2 }, put: { bid: 9, ask: 9.5 } });
  });
  it('parses one-row-per-option CSV', () => {
    const r = parseChain('type;strike;bid;ask\nC;100;5;5,5\nP;100;4;4,4');
    expect(r.rows[0]).toMatchObject({ strike: 100, call: { bid: 5, ask: 5.5 }, put: { bid: 4, ask: 4.4 } });
  });
});

describe('chain analytics (MSTR, conversation figures)', () => {
  it('implied spot ≈ 139–140 by put-call parity', () => {
    const res = impliedSpot(mstrChain, 0.035, 0, '2026-10-16')!;
    expect(res.spot).toBeGreaterThan(138);
    expect(res.spot).toBeLessThan(141);
  });
  it('IV ≈ 70 %', () => {
    const row = mstrChain.rows.find((r) => r.strike === 140)!;
    const iv = quoteIv(mstr, EXP, 140, 'C', row.call);
    expect(iv).toBeGreaterThan(0.68);
    expect(iv).toBeLessThan(0.72);
  });
});

describe('MSTR bull call spread 150/250 filled at 21', () => {
  const legs = [opt('C', 150, 1, 56.95 - 0), opt('C', 250, -1, 35.95)]; // net 21.00
  it('cost, max profit, breakeven', () => {
    expect(netCost(legs, 100)).toBeCloseTo(2100, 6);
    const e = extremes(legs, mstr, EXP);
    expect(e.maxProfit).toBeCloseTo(7900, 6);
    expect(e.maxLoss).toBeCloseTo(2100, 6);
    expect(e.unlimitedLoss).toBe(false);
    expect(e.unlimitedProfit).toBe(false);
    const be = breakevens(legs, mstr, EXP);
    expect(be).toHaveLength(1);
    expect(be[0]).toBeCloseTo(171, 3);
  });
  it('matrix values', () => {
    expect(pnlAt(legs, mstr, 160, EXP)).toBeCloseTo(-1100, 6);
    expect(pnlAt(legs, mstr, 200, EXP)).toBeCloseTo(2900, 6);
    expect(pnlAt(legs, mstr, 225, EXP)).toBeCloseTo(5400, 6);
    const a = analyze(legs, mstr, DEFAULT_CONFIG);
    expect(a.returnOnRisk).toBeCloseTo(7900 / 2100, 6);
    expect(a.margin.requirement).toBeCloseTo(2100, 3);
  });
});

describe('GOOGL strategies (worst-case fills)', () => {
  const build = (templateId: string, strikes: Record<string, number>) =>
    buildLegs({ templateId, strikes, expiries: { E1: EXP }, units: 1, mode: 'worst' }, googl, [googlChain]);

  it('A: call spread 300/400 costs 31.50 and makes 68.50 at 412', () => {
    const legs = build('bull_call_spread', { K1: 300, K2: 400 });
    expect(netCost(legs, 100)).toBeCloseTo(3150, 6);
    expect(pnlAt(legs, googl, 412, EXP)).toBeCloseTo(6850, 6);
    expect(pnlAt(legs, googl, 275, EXP)).toBeCloseTo(-3150, 6);
    expect(breakevens(legs, googl, EXP)[0]).toBeCloseTo(331.5, 3);
    expect(marginAt(legs, googl, 220, googl.valuationDate).requirement).toBeCloseTo(3150, 3);
  });

  it('B: bull put spread 280/230 credit 18.60, risk 31.40', () => {
    const legs = build('bull_put_spread', { K1: 280, K2: 230 });
    expect(netCost(legs, 100)).toBeCloseTo(-1860, 6);
    expect(pnlAt(legs, googl, 275, EXP)).toBeCloseTo(1360, 6);
    expect(pnlAt(legs, googl, 220, EXP)).toBeCloseTo(-3140, 6);
    const m = marginAt(legs, googl, 275, googl.valuationDate);
    expect(m.requirement).toBeCloseTo(3140, 3);
    expect(m.nakedCount).toBe(0);
  });

  it('D: short put 230 + call spread 300/400', () => {
    const legs = build('seagull', { K1: 230, K2: 300, K3: 400 });
    expect(netCost(legs, 100)).toBeCloseTo(1000, 6);
    expect(pnlAt(legs, googl, 220, EXP)).toBeCloseTo(-2000, 6);
    expect(pnlAt(legs, googl, 412, EXP)).toBeCloseTo(9000, 6);
    const m = marginAt(legs, googl, 275, googl.valuationDate);
    expect(m.nakedCount).toBe(1);
    // Naked put add-on: max(20 %·275 − 45, 10 %·230) = 23 → 2,300 + covered 3,150 (+ put mark).
    expect(m.liquidityImpact).toBeGreaterThan(3150 + 2300 - 50);
    expect(m.liquidityImpact).toBeLessThan(3150 + 2300 + 400);
    const e = extremes(legs, googl, EXP);
    expect(e.unlimitedLoss).toBe(false);
    expect(e.maxLoss).toBeCloseTo(24000, 0); // put assigned at 0: 230·100 + 1,000 debit
  });

  it('stress margin increases for naked shorts on a drop', () => {
    const legs = build('short_put', { K1: 230 });
    const a = analyze(legs, googl, { ...DEFAULT_CONFIG, liquidity: 10000 });
    const down = a.stress.find((s) => s.move === -20)!;
    const up = a.stress.find((s) => s.move === 10)!;
    expect(down.margin.requirement).toBeGreaterThan(up.margin.requirement);
    expect(down.liquidityAfter!).toBeLessThan(10000 - a.margin.liquidityImpact);
  });

  it('long call has unlimited profit', () => {
    const legs = build('long_call', { K1: 300 });
    const a = analyze(legs, googl, DEFAULT_CONFIG);
    expect(a.ext.unlimitedProfit).toBe(true);
    expect(a.ext.maxLoss).toBeCloseTo(6105, 3);
    expect(a.pop).toBeGreaterThan(0);
    expect(a.pop).toBeLessThan(1);
  });

  it('covered call: stock covers the short call', () => {
    const legs = build('covered_call', { K1: 300 });
    const m = marginAt(legs, googl, 275, googl.valuationDate, 0, true);
    expect(m.nakedCount).toBe(0);
    expect(m.stockPart).toBeCloseTo(0.5 * 275 * 100, 6);
  });
});
