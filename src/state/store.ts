import { useEffect, useState } from 'react';
import { DEFAULT_CONFIG, type AnalysisConfig } from '../engine/analysis';
import { buildLegs, defaultStrikes, getTemplate } from '../engine/strategies';
import type { Chain, Leg, Market, PriceMode } from '../engine/types';
import { parseChain } from '../parse/chainParser';
import { EXAMPLE_GOOGL_TEXT } from './example';

export interface StrategyState {
  templateId: string;
  strikes: Record<string, number>;
  expiries: Record<string, string>;
  units: number;
  mode: PriceMode;
  legs: Leg[];
  /** True once the user edited legs by hand (template changes then ask before overwriting). */
  edited: boolean;
}

export interface SavedStrategy {
  id: string;
  name: string;
  savedAt: string;
  market: Market;
  legs: Leg[];
  templateId: string;
}

export interface AppState {
  version: 1;
  market: Market;
  chains: Chain[];
  activeExpiry: string;
  strategy: StrategyState;
  config: AnalysisConfig;
  saved: SavedStrategy[];
}

const KEY = 'asymmetric-options:v1';

export function todayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

export function exampleState(): AppState {
  const market: Market = { ticker: 'GOOGL', spot: 275, rate: 0.04, dividend: 0.003, valuationDate: todayIso(), multiplier: 100 };
  const expiry = '2028-12-15';
  const chains: Chain[] = [{ expiry, rows: parseChain(EXAMPLE_GOOGL_TEXT).rows }];
  const templateId = 'bull_call_spread';
  const strikes = { K1: 300, K2: 400 };
  const expiries = { E1: expiry, E2: expiry };
  const legs = buildLegs({ templateId, strikes, expiries, units: 1, mode: 'worst' }, market, chains);
  return {
    version: 1,
    market,
    chains,
    activeExpiry: expiry,
    strategy: { templateId, strikes, expiries, units: 1, mode: 'worst', legs, edited: false },
    config: DEFAULT_CONFIG,
    saved: [],
  };
}

export function blankState(): AppState {
  const market: Market = { ticker: '', spot: 100, rate: 0.04, dividend: 0, valuationDate: todayIso(), multiplier: 100 };
  return {
    version: 1,
    market,
    chains: [],
    activeExpiry: '',
    strategy: { templateId: 'bull_call_spread', strikes: defaultStrikes(getTemplate('bull_call_spread'), undefined, 100), expiries: {}, units: 1, mode: 'worst', legs: [], edited: false },
    config: DEFAULT_CONFIG,
    saved: [],
  };
}

export function isAppState(x: unknown): x is AppState {
  const s = x as AppState;
  return !!s && s.version === 1 && !!s.market && Array.isArray(s.chains) && !!s.strategy && Array.isArray(s.strategy.legs);
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isAppState(parsed)) return { ...parsed, config: { ...DEFAULT_CONFIG, ...parsed.config } };
    }
  } catch {
    /* storage unavailable or corrupt: fall back to the example */
  }
  return exampleState();
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode */
    }
  }, [state]);
  return [state, setState] as const;
}
