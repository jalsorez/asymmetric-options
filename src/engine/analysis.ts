import { addDays, parseDate, yearFrac } from './blackScholes';
import { marginAt, type MarginResult } from './margin';
import {
  breakevens,
  extremes,
  horizonDate,
  netCost,
  pnlAt,
  positionGreeks,
  probAbove,
  probProfit,
  strikesOf,
  type Extremes,
  type PositionGreeks,
} from './payoff';
import type { Leg, Market } from './types';

export interface Scenario {
  label: string;
  /** % move of the underlying at the horizon (e.g. 50 = +50 %). */
  move: number;
  /** Probability weight in %. */
  prob: number;
}

export interface AnalysisConfig {
  /** Price rows of the matrices, as % move from spot. */
  rangeFrom: number;
  rangeTo: number;
  rangeStep: number;
  includeKeyPoints: boolean;
  /** Number of date columns in the time × price matrix (including today and expiry). */
  timeColumns: number;
  /** Vol shift (decimal, e.g. 0.05) applied to pre-expiry valuations. */
  ivShift: number;
  stressMoves: number[];
  stressDays: number;
  /** Extra vol (decimal) on down moves in the stress test. */
  stressIvUp: number;
  /** Excess liquidity available before the trade ($), for margin-call warnings. */
  liquidity: number | null;
  scenarios: Scenario[];
  /** Vol for probabilities; null = average leg IV. */
  probIv: number | null;
}

export const DEFAULT_CONFIG: AnalysisConfig = {
  rangeFrom: -50,
  rangeTo: 100,
  rangeStep: 10,
  includeKeyPoints: true,
  timeColumns: 6,
  ivShift: 0,
  stressMoves: [-30, -20, -10, 10, 20],
  stressDays: 30,
  stressIvUp: 0.05,
  liquidity: null,
  scenarios: [
    { label: 'Pla', move: 0, prob: 50 },
    { label: 'Objectiu', move: 50, prob: 50 },
  ],
  probIv: null,
};

export interface MatrixRow {
  price: number;
  move: number;
  pnl: number;
  /** P&L divided by the risk base. */
  ret: number | null;
  probAbove: number;
  key: string | null;
}

export interface StressRow {
  move: number;
  price: number;
  pnl: number;
  margin: MarginResult;
  liquidityAfter: number | null;
}

export interface ScenarioRow extends Scenario {
  price: number;
  pnl: number;
  ret: number | null;
}

export interface ChartPoint {
  price: number;
  expiry: number;
  today: number;
  mid: number;
}

export interface Analysis {
  cost: number;
  horizon: string;
  T: number;
  ext: Extremes;
  breakevens: number[];
  /** Capital considered "at risk": max loss when bounded, otherwise the margin requirement. */
  riskBase: number;
  riskBaseLabel: string;
  returnOnRisk: number | null;
  margin: MarginResult;
  greeks: PositionGreeks;
  probIv: number;
  pop: number;
  matrix: MatrixRow[];
  timeDates: string[];
  timeMatrix: { price: number; move: number; values: number[] }[];
  stress: StressRow[];
  scenarios: ScenarioRow[];
  ev: number | null;
  evRet: number | null;
  chart: ChartPoint[];
  midDate: string;
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

export function avgIv(legs: Leg[]): number {
  const opts = legs.filter((l) => l.kind === 'option' && l.iv > 0);
  const w = opts.reduce((a, l) => a + Math.abs(l.qty), 0);
  if (w === 0) return 0.3;
  return opts.reduce((a, l) => a + l.iv * Math.abs(l.qty), 0) / w;
}

export function priceRows(legs: Leg[], market: Market, cfg: AnalysisConfig, bes: number[]): { price: number; key: string | null }[] {
  const S = market.spot;
  const rows = new Map<number, string | null>();
  const step = Math.max(0.5, Math.abs(cfg.rangeStep) || 10);
  const from = Math.min(cfg.rangeFrom, cfg.rangeTo);
  const to = Math.max(cfg.rangeFrom, cfg.rangeTo);
  for (let p = from; p <= to + 1e-9; p += step) {
    const price = round2(S * (1 + p / 100));
    if (price > 0) rows.set(price, Math.abs(p) < 1e-9 ? 'Preu actual' : null);
  }
  if (cfg.includeKeyPoints) {
    rows.set(round2(S), 'Preu actual');
    for (const k of strikesOf(legs)) if (!rows.has(k)) rows.set(k, 'Strike');
    for (const b of bes) rows.set(round2(b), 'Breakeven');
  }
  return [...rows.entries()].map(([price, key]) => ({ price, key })).sort((a, b) => a.price - b.price);
}

export function analyze(legs: Leg[], market: Market, cfg: AnalysisConfig): Analysis {
  const S = market.spot;
  const cost = netCost(legs, market.multiplier);
  const horizon = horizonDate(legs, market);
  const T = yearFrac(market.valuationDate, horizon);
  const ext = extremes(legs, market, horizon);
  const bes = breakevens(legs, market, horizon);
  const margin = marginAt(legs, market, S, market.valuationDate, 0, true);
  // Defined-risk trades are measured against their max loss; trades with naked shorts against margin.
  const definedRisk = !ext.unlimitedLoss && margin.nakedCount === 0 && ext.maxLoss > 0;
  const riskBase = definedRisk ? ext.maxLoss : margin.requirement;
  const riskBaseLabel = definedRisk ? 'pèrdua màxima' : 'marge requerit';
  const ret = (x: number) => (riskBase > 0 ? x / riskBase : null);
  const probIv = cfg.probIv ?? avgIv(legs);

  const matrix: MatrixRow[] = priceRows(legs, market, cfg, bes).map(({ price, key }) => {
    const pnl = pnlAt(legs, market, price, horizon);
    return { price, move: price / S - 1, pnl, ret: ret(pnl), probAbove: probAbove(price, market, T, probIv), key };
  });

  // Time × price matrix: evenly spaced dates from today to the horizon.
  const n = Math.max(2, Math.min(10, Math.round(cfg.timeColumns)));
  const totalDays = Math.round((parseDate(horizon) - parseDate(market.valuationDate)) / 86_400_000);
  const timeDates: string[] = [];
  for (let i = 0; i < n; i++) timeDates.push(i === n - 1 ? horizon : addDays(market.valuationDate, Math.round((totalDays * i) / (n - 1))));
  const timeMatrix = matrix.map((r) => ({
    price: r.price,
    move: r.move,
    values: timeDates.map((d) => pnlAt(legs, market, r.price, d, d === horizon ? 0 : cfg.ivShift)),
  }));

  const stressDate = addDays(market.valuationDate, Math.max(0, Math.min(cfg.stressDays, totalDays)));
  const stress: StressRow[] = [...cfg.stressMoves].sort((a, b) => a - b).map((mv) => {
    const price = S * (1 + mv / 100);
    const iv = cfg.ivShift + (mv < 0 ? cfg.stressIvUp : 0);
    const pnl = pnlAt(legs, market, price, stressDate, iv);
    const m = marginAt(legs, market, price, stressDate, iv);
    return { move: mv, price, pnl, margin: m, liquidityAfter: cfg.liquidity == null ? null : cfg.liquidity - m.liquidityImpact };
  });

  const scenarios: ScenarioRow[] = cfg.scenarios.map((s) => {
    const price = S * (1 + s.move / 100);
    const pnl = pnlAt(legs, market, price, horizon);
    return { ...s, price, pnl, ret: ret(pnl) };
  });
  const wsum = scenarios.reduce((a, s) => a + Math.max(0, s.prob), 0);
  const ev = wsum > 0 ? scenarios.reduce((a, s) => a + Math.max(0, s.prob) * s.pnl, 0) / wsum : null;

  const ks = strikesOf(legs);
  const lo = Math.max(0, Math.min(S * 0.4, (ks[0] ?? S) * 0.7));
  const hi = Math.max(S * 1.8, (ks[ks.length - 1] ?? S) * 1.3);
  const midDate = addDays(market.valuationDate, Math.round(totalDays / 2));
  const chart: ChartPoint[] = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const price = lo + ((hi - lo) * i) / N;
    chart.push({
      price: round2(price),
      expiry: pnlAt(legs, market, price, horizon),
      today: pnlAt(legs, market, price, market.valuationDate, cfg.ivShift),
      mid: pnlAt(legs, market, price, midDate, cfg.ivShift),
    });
  }

  return {
    cost,
    horizon,
    T,
    ext,
    breakevens: bes,
    riskBase,
    riskBaseLabel,
    returnOnRisk: ext.unlimitedProfit ? null : ret(ext.maxProfit),
    margin,
    greeks: positionGreeks(legs, market),
    probIv,
    pop: probProfit(legs, market, horizon, probIv),
    matrix,
    timeDates,
    timeMatrix,
    stress,
    scenarios,
    ev,
    evRet: ev == null ? null : ret(ev),
    chart,
    midDate,
  };
}
