import { useState } from 'react';
import { impliedSpot } from '../engine/chain';
import type { Chain, Market } from '../engine/types';
import { pct, price } from '../format';
import { NumInput } from './NumInput';

interface Props {
  market: Market;
  chain: Chain | undefined;
  onChange: (m: Market) => void;
}

export function MarketPanel({ market, chain, onChange }: Props) {
  const [parityMsg, setParityMsg] = useState<string | null>(null);
  const set = (patch: Partial<Market>) => onChange({ ...market, ...patch });

  const runParity = () => {
    if (!chain) return setParityMsg('Cal una cadena amb calls i puts.');
    const r = impliedSpot(chain, market.rate, market.dividend, market.valuationDate);
    if (!r) return setParityMsg('No hi ha prou strikes amb call i put per calcular-ho.');
    set({ spot: Math.round(r.spot * 100) / 100 });
    setParityMsg(
      `Preu implícit ${price(r.spot)} (${r.strikesUsed} strikes prop dels diners)` +
        (r.impliedRate != null ? ` · tipus implícit per regressió ≈ ${pct(r.impliedRate, { plus: false, decimals: 1 })}` : ''),
    );
  };

  return (
    <section className="card">
      <h2>1 · Subjacent</h2>
      <div className="form-grid">
        <label>
          Ticker
          <input value={market.ticker} onChange={(e) => set({ ticker: e.target.value.toUpperCase() })} placeholder="p. ex. GOOGL" />
        </label>
        <label>
          Preu actual ($)
          <div className="inline">
            <NumInput value={market.spot} onChange={(v) => v != null && v > 0 && set({ spot: v })} />
            <button type="button" className="ghost small" onClick={runParity} title="Calcula el preu a partir de la paritat put-call de la cadena seleccionada">
              Per paritat
            </button>
          </div>
        </label>
        <label>
          Data de valoració
          <input type="date" value={market.valuationDate} onChange={(e) => e.target.value && set({ valuationDate: e.target.value })} />
        </label>
        <label>
          Tipus d’interès (%)
          <NumInput value={market.rate} scale={100} onChange={(v) => v != null && set({ rate: v })} />
        </label>
        <label>
          Dividend (% anual)
          <NumInput value={market.dividend} scale={100} onChange={(v) => v != null && set({ dividend: v })} />
        </label>
        <label>
          Accions per contracte
          <NumInput value={market.multiplier} min={1} onChange={(v) => v != null && v >= 1 && set({ multiplier: Math.round(v) })} />
        </label>
      </div>
      {parityMsg && <p className="hint">{parityMsg}</p>}
    </section>
  );
}
