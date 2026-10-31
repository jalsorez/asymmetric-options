import { useMemo, useState } from 'react';
import { analyze, type AnalysisConfig } from '../engine/analysis';
import { getTemplate } from '../engine/strategies';
import type { Leg, Market } from '../engine/types';
import { money, pct, price, tone } from '../format';
import type { SavedStrategy } from '../state/store';

interface Props {
  saved: SavedStrategy[];
  config: AnalysisConfig;
  current: { market: Market; legs: Leg[]; templateId: string };
  onSave: (s: SavedStrategy) => void;
  onDelete: (id: string) => void;
  onLoad: (s: SavedStrategy) => void;
}

function describe(legs: Leg[]): string {
  return legs
    .map((l) => (l.kind === 'stock' ? `${l.qty > 0 ? '+' : '−'}${Math.abs(l.qty)} acc.` : `${l.qty > 0 ? '+' : '−'}${Math.abs(l.qty)} ${l.type}${l.strike}`))
    .join(' ');
}

export function Compare({ saved, config, current, onSave, onDelete, onLoad }: Props) {
  const [name, setName] = useState('');
  const rows = useMemo(
    () =>
      saved.map((s) => {
        try {
          return { s, a: analyze(s.legs, s.market, config) };
        } catch {
          return { s, a: null };
        }
      }),
    [saved, config],
  );
  const stressMove = config.stressMoves.includes(-20) ? -20 : [...config.stressMoves].sort((a, b) => a - b)[0];

  const save = () => {
    if (current.legs.length === 0) return;
    const tpl = getTemplate(current.templateId);
    onSave({
      id: `s${Date.now().toString(36)}`,
      name: name.trim() || `${current.market.ticker || 'Estratègia'} · ${tpl.name} ${describe(current.legs)}`,
      savedAt: new Date().toISOString(),
      market: current.market,
      legs: current.legs,
      templateId: current.templateId,
    });
    setName('');
  };

  return (
    <section className="card">
      <h2>5 · Comparador</h2>
      <p className="hint">Desa l’estratègia actual i compara-la amb altres (fins i tot d’altres accions). Les columnes d’escenaris i d’estrès fan servir la configuració de dalt.</p>
      <div className="inline">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (opcional), p. ex. GOOGL A 300/400" style={{ flex: 1, minWidth: '12em' }} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button type="button" onClick={save} disabled={current.legs.length === 0}>
          Desar l’estratègia actual
        </button>
      </div>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="matrix compare">
            <thead>
              <tr>
                <th>Estratègia</th>
                <th>Cost</th>
                <th>Guany màx.</th>
                <th>Pèrdua màx.</th>
                <th>Breakeven</th>
                <th>Marge</th>
                {config.scenarios.map((sc, i) => (
                  <th key={i}>
                    {sc.label} ({pct(sc.move / 100)})
                  </th>
                ))}
                {stressMove != null && <th>Xoc {pct(stressMove / 100)} ara</th>}
                <th>Esperat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, a }) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="muted small">
                      {s.market.ticker} @ {price(s.market.spot)} · {describe(s.legs)}
                    </div>
                  </td>
                  {a ? (
                    <>
                      <td className={`numcell ${a.cost > 0 ? 'neg' : 'pos'}`}>{money(-a.cost, { plus: true })}</td>
                      <td className="numcell pos">
                        {a.ext.unlimitedProfit ? 'Il·limitat' : money(a.ext.maxProfit, { plus: true })}
                        {a.returnOnRisk != null && <span className="cellpct">{pct(a.returnOnRisk)}</span>}
                      </td>
                      <td className="numcell neg">{a.ext.unlimitedLoss ? 'Il·limitada' : money(-a.ext.maxLoss)}</td>
                      <td className="numcell">{a.breakevens.map((b) => price(b)).join(' · ') || '—'}</td>
                      <td className="numcell">{money(a.margin.requirement)}</td>
                      {a.scenarios.map((sc, i) => (
                        <td key={i} className={`numcell ${tone(sc.pnl)}`}>
                          {money(sc.pnl, { plus: true })}
                          <span className="cellpct">{pct(sc.ret)}</span>
                        </td>
                      ))}
                      {stressMove != null && (
                        <td className={`numcell ${tone(a.stress.find((x) => x.move === stressMove)?.pnl)}`}>{money(a.stress.find((x) => x.move === stressMove)?.pnl, { plus: true })}</td>
                      )}
                      <td className={`numcell ${tone(a.ev)}`}>
                        <strong>{money(a.ev, { plus: true })}</strong>
                        <span className="cellpct">{pct(a.evRet)}</span>
                      </td>
                    </>
                  ) : (
                    <td colSpan={6 + config.scenarios.length}>Error en l’anàlisi</td>
                  )}
                  <td className="nowrap">
                    <button type="button" className="ghost small" onClick={() => onLoad(s)}>
                      Obrir
                    </button>
                    <button type="button" className="icon" title="Eliminar" onClick={() => confirm(`Eliminar «${s.name}»?`) && onDelete(s.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
