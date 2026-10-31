import { impliedVol, yearFrac } from './blackScholes';
import { atmIv, fillPrice, findRow, quoteMid, sideQuote, strikeIv } from './chain';
import type { Chain, Leg, Market, OptType, PriceMode } from './types';

export type StrikeKey = 'K1' | 'K2' | 'K3' | 'K4';
export type ExpiryKey = 'E1' | 'E2';

interface TemplateLeg {
  side: 1 | -1;
  kind: 'option' | 'stock';
  type?: OptType;
  strike?: StrikeKey;
  expiry?: ExpiryKey;
  ratio?: number;
}

export interface StrategyTemplate {
  id: string;
  name: string;
  group: string;
  description: string;
  /** Strike parameters with their default moneyness (strike / spot). */
  strikes: { key: StrikeKey; label: string; moneyness: number }[];
  /** E2 only for multi-expiry structures (calendar/diagonal): E2 is the later one. */
  expiries: ExpiryKey[];
  legs: TemplateLeg[];
}

const C = 'C' as const;
const P = 'P' as const;

export const TEMPLATES: StrategyTemplate[] = [
  { id: 'long_call', group: 'Direccionals', name: 'Compra de call', description: 'Alcista amb pèrdua limitada a la prima. Guany il·limitat.', strikes: [{ key: 'K1', label: 'Strike', moneyness: 1 }], expiries: ['E1'], legs: [{ side: 1, kind: 'option', type: C, strike: 'K1' }] },
  { id: 'long_put', group: 'Direccionals', name: 'Compra de put', description: 'Baixista o cobertura. Pèrdua limitada a la prima.', strikes: [{ key: 'K1', label: 'Strike', moneyness: 1 }], expiries: ['E1'], legs: [{ side: 1, kind: 'option', type: P, strike: 'K1' }] },
  { id: 'short_put', group: 'Venda de prima', name: 'Venda de put', description: 'Cobres prima; si acaba per sota del strike compres les accions. Guany limitat, risc gran.', strikes: [{ key: 'K1', label: 'Strike', moneyness: 0.9 }], expiries: ['E1'], legs: [{ side: -1, kind: 'option', type: P, strike: 'K1' }] },
  { id: 'short_call', group: 'Venda de prima', name: 'Venda de call nua', description: 'Baixista/neutral. Risc il·limitat a l’alça.', strikes: [{ key: 'K1', label: 'Strike', moneyness: 1.1 }], expiries: ['E1'], legs: [{ side: -1, kind: 'option', type: C, strike: 'K1' }] },
  { id: 'covered_call', group: 'Amb accions', name: 'Covered call', description: '100 accions + venda d’una call. Ingressos a canvi de limitar l’alça.', strikes: [{ key: 'K1', label: 'Call venuda', moneyness: 1.1 }], expiries: ['E1'], legs: [{ side: 1, kind: 'stock' }, { side: -1, kind: 'option', type: C, strike: 'K1' }] },
  { id: 'collar', group: 'Amb accions', name: 'Collar', description: 'Accions + put comprada (protecció) + call venuda (finançament).', strikes: [{ key: 'K1', label: 'Put comprada', moneyness: 0.9 }, { key: 'K2', label: 'Call venuda', moneyness: 1.15 }], expiries: ['E1'], legs: [{ side: 1, kind: 'stock' }, { side: 1, kind: 'option', type: P, strike: 'K1' }, { side: -1, kind: 'option', type: C, strike: 'K2' }] },
  { id: 'stock', group: 'Amb accions', name: 'Accions (referència)', description: 'Comprar 100 accions, per comparar.', strikes: [], expiries: ['E1'], legs: [{ side: 1, kind: 'stock' }] },
  { id: 'bull_call_spread', group: 'Spreads verticals', name: 'Bull call spread', description: 'Compra call K1, venda call K2. Risc i guany limitats; sostre a K2.', strikes: [{ key: 'K1', label: 'Call comprada', moneyness: 1 }, { key: 'K2', label: 'Call venuda', moneyness: 1.4 }], expiries: ['E1'], legs: [{ side: 1, kind: 'option', type: C, strike: 'K1' }, { side: -1, kind: 'option', type: C, strike: 'K2' }] },
  { id: 'itm_call_spread', group: 'Spreads verticals', name: 'Call spread ITM', description: 'Com el bull call spread però amb K1 per sota del preu: perd menys si l’acció queda plana.', strikes: [{ key: 'K1', label: 'Call comprada (ITM)', moneyness: 0.85 }, { key: 'K2', label: 'Call venuda', moneyness: 1.5 }], expiries: ['E1'], legs: [{ side: 1, kind: 'option', type: C, strike: 'K1' }, { side: -1, kind: 'option', type: C, strike: 'K2' }] },
  { id: 'bull_put_spread', group: 'Spreads verticals', name: 'Bull put spread', description: 'Venda put K1, compra put K2 < K1. Crèdit; guanya si queda per sobre de K1.', strikes: [{ key: 'K1', label: 'Put venuda', moneyness: 1 }, { key: 'K2', label: 'Put comprada', moneyness: 0.83 }], expiries: ['E1'], legs: [{ side: -1, kind: 'option', type: P, strike: 'K1' }, { side: 1, kind: 'option', type: P, strike: 'K2' }] },
  { id: 'bear_put_spread', group: 'Spreads verticals', name: 'Bear put spread', description: 'Compra put K1, venda put K2 < K1. Baixista amb risc limitat.', strikes: [{ key: 'K1', label: 'Put comprada', moneyness: 1 }, { key: 'K2', label: 'Put venuda', moneyness: 0.8 }], expiries: ['E1'], legs: [{ side: 1, kind: 'option', type: P, strike: 'K1' }, { side: -1, kind: 'option', type: P, strike: 'K2' }] },
  { id: 'bear_call_spread', group: 'Spreads verticals', name: 'Bear call spread', description: 'Venda call K1, compra call K2 > K1. Crèdit; guanya si no puja.', strikes: [{ key: 'K1', label: 'Call venuda', moneyness: 1.05 }, { key: 'K2', label: 'Call comprada', moneyness: 1.2 }], expiries: ['E1'], legs: [{ side: -1, kind: 'option', type: C, strike: 'K1' }, { side: 1, kind: 'option', type: C, strike: 'K2' }] },
  { id: 'risk_reversal', group: 'Combinacions alcistes', name: 'Risk reversal', description: 'Venda put K1 finança compra call K2. Exposició semblant a accions amb poc capital.', strikes: [{ key: 'K1', label: 'Put venuda', moneyness: 0.85 }, { key: 'K2', label: 'Call comprada', moneyness: 1.1 }], expiries: ['E1'], legs: [{ side: -1, kind: 'option', type: P, strike: 'K1' }, { side: 1, kind: 'option', type: C, strike: 'K2' }] },
  { id: 'seagull', group: 'Combinacions alcistes', name: 'Put venuda + call spread', description: 'La prima de la put paga el call spread. Poc capital, però risc a la baixa sota K1.', strikes: [{ key: 'K1', label: 'Put venuda', moneyness: 0.85 }, { key: 'K2', label: 'Call comprada', moneyness: 1.1 }, { key: 'K3', label: 'Call venuda', moneyness: 1.45 }], expiries: ['E1'], legs: [{ side: -1, kind: 'option', type: P, strike: 'K1' }, { side: 1, kind: 'option', type: C, strike: 'K2' }, { side: -1, kind: 'option', type: C, strike: 'K3' }] },
  { id: 'bull_combo', group: 'Combinacions alcistes', name: 'Bull put spread + bull call spread', description: 'Combina el crèdit del put spread amb l’alça del call spread. Risc totalment definit.', strikes: [{ key: 'K1', label: 'Put comprada', moneyness: 0.83 }, { key: 'K2', label: 'Put venuda', moneyness: 1 }, { key: 'K3', label: 'Call comprada', moneyness: 1.1 }, { key: 'K4', label: 'Call venuda', moneyness: 1.45 }], expiries: ['E1'], legs: [{ side: 1, kind: 'option', type: P, strike: 'K1' }, { side: -1, kind: 'option', type: P, strike: 'K2' }, { side: 1, kind: 'option', type: C, strike: 'K3' }, { side: -1, kind: 'option', type: C, strike: 'K4' }] },
  { id: 'long_straddle', group: 'Volatilitat', name: 'Long straddle', description: 'Compra call i put al mateix strike. Guanya amb moviments grans.', strikes: [{ key: 'K1', label: 'Strike', moneyness: 1 }], expiries: ['E1'], legs: [{ side: 1, kind: 'option', type: C, strike: 'K1' }, { side: 1, kind: 'option', type: P, strike: 'K1' }] },
  { id: 'long_strangle', group: 'Volatilitat', name: 'Long strangle', description: 'Compra put K1 i call K2 fora de diners.', strikes: [{ key: 'K1', label: 'Put comprada', moneyness: 0.9 }, { key: 'K2', label: 'Call comprada', moneyness: 1.1 }], expiries: ['E1'], legs: [{ side: 1, kind: 'option', type: P, strike: 'K1' }, { side: 1, kind: 'option', type: C, strike: 'K2' }] },
  { id: 'short_strangle', group: 'Volatilitat', name: 'Short strangle', description: 'Venda put K1 i call K2. Guanya si es queda en rang; risc il·limitat.', strikes: [{ key: 'K1', label: 'Put venuda', moneyness: 0.85 }, { key: 'K2', label: 'Call venuda', moneyness: 1.15 }], expiries: ['E1'], legs: [{ side: -1, kind: 'option', type: P, strike: 'K1' }, { side: -1, kind: 'option', type: C, strike: 'K2' }] },
  { id: 'iron_condor', group: 'Volatilitat', name: 'Iron condor', description: 'Rang amb risc definit: put spread + call spread venuts.', strikes: [{ key: 'K1', label: 'Put comprada', moneyness: 0.8 }, { key: 'K2', label: 'Put venuda', moneyness: 0.9 }, { key: 'K3', label: 'Call venuda', moneyness: 1.1 }, { key: 'K4', label: 'Call comprada', moneyness: 1.2 }], expiries: ['E1'], legs: [{ side: 1, kind: 'option', type: P, strike: 'K1' }, { side: -1, kind: 'option', type: P, strike: 'K2' }, { side: -1, kind: 'option', type: C, strike: 'K3' }, { side: 1, kind: 'option', type: C, strike: 'K4' }] },
  { id: 'pmcc', group: 'Temporals', name: 'Diagonal / poor man’s covered call', description: 'Compra call LEAPS molt ITM (venciment llarg) i ven calls curtes fora de diners.', strikes: [{ key: 'K1', label: 'Call llarga (ITM)', moneyness: 0.75 }, { key: 'K2', label: 'Call curta venuda', moneyness: 1.1 }], expiries: ['E1', 'E2'], legs: [{ side: 1, kind: 'option', type: C, strike: 'K1', expiry: 'E2' }, { side: -1, kind: 'option', type: C, strike: 'K2', expiry: 'E1' }] },
  { id: 'calendar', group: 'Temporals', name: 'Calendar spread (call)', description: 'Venda call curta i compra call llarga al mateix strike.', strikes: [{ key: 'K1', label: 'Strike', moneyness: 1 }], expiries: ['E1', 'E2'], legs: [{ side: -1, kind: 'option', type: C, strike: 'K1', expiry: 'E1' }, { side: 1, kind: 'option', type: C, strike: 'K1', expiry: 'E2' }] },
  { id: 'custom', group: 'Lliure', name: 'Personalitzada', description: 'Afegeix i edita les potes que vulguis.', strikes: [], expiries: ['E1'], legs: [] },
];

export function getTemplate(id: string): StrategyTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1];
}

export function nearestStrike(chain: Chain | undefined, target: number): number {
  if (!chain || chain.rows.length === 0) return Math.round(target);
  return chain.rows.reduce((best, r) => (Math.abs(r.strike - target) < Math.abs(best - target) ? r.strike : best), chain.rows[0].strike);
}

export function defaultStrikes(t: StrategyTemplate, chain: Chain | undefined, spot: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of t.strikes) out[s.key] = nearestStrike(chain, spot * s.moneyness);
  return out;
}

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `l${Date.now().toString(36)}${idCounter}`;
}

/** Price and IV for an option leg from the chain, with sensible fallbacks. */
export function priceLeg(
  market: Market,
  chain: Chain | undefined,
  type: OptType,
  strike: number,
  expiry: string,
  side: 'buy' | 'sell',
  mode: PriceMode,
): { price: number; iv: number } {
  const row = findRow(chain, strike);
  const T = yearFrac(market.valuationDate, expiry);
  let price = 0;
  let iv = NaN;
  if (row && chain) {
    const q = sideQuote(row, type);
    price = fillPrice(q, side, mode) ?? 0;
    iv = strikeIv(market, chain, strike, type);
    if (!Number.isFinite(iv) && quoteMid(q) != null) iv = impliedVol(type, quoteMid(q)!, market.spot, strike, T, market.rate, market.dividend);
  }
  if (!Number.isFinite(iv)) iv = atmIv(market, chain);
  if (!Number.isFinite(iv)) iv = 0.3;
  return { price, iv };
}

export interface BuildInput {
  templateId: string;
  strikes: Record<string, number>;
  expiries: Record<string, string>;
  units: number;
  mode: PriceMode;
}

export function buildLegs(input: BuildInput, market: Market, chains: Chain[]): Leg[] {
  const t = getTemplate(input.templateId);
  const chainFor = (exp: string) => chains.find((c) => c.expiry === exp);
  return t.legs.map((tl) => {
    const expiry = input.expiries[tl.expiry ?? 'E1'] ?? input.expiries.E1 ?? '';
    const ratio = tl.ratio ?? 1;
    if (tl.kind === 'stock') {
      return { id: newId(), kind: 'stock', type: 'C', strike: 0, expiry, qty: tl.side * ratio * input.units * market.multiplier, price: market.spot, iv: 0 };
    }
    const strike = input.strikes[tl.strike ?? 'K1'] ?? market.spot;
    const { price, iv } = priceLeg(market, chainFor(expiry), tl.type!, strike, expiry, tl.side > 0 ? 'buy' : 'sell', input.mode);
    return { id: newId(), kind: 'option', type: tl.type!, strike, expiry, qty: tl.side * ratio * input.units, price, iv };
  });
}
