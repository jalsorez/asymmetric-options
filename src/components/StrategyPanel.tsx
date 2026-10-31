import { buildLegs, defaultStrikes, getTemplate, newId, priceLeg, TEMPLATES } from '../engine/strategies';
import { netCost } from '../engine/payoff';
import type { Chain, Leg, Market, PriceMode } from '../engine/types';
import type { StrategyState } from '../state/store';
import { dateCa, money, pct } from '../format';
import { NumInput } from './NumInput';

interface Props {
  market: Market;
  chains: Chain[];
  strategy: StrategyState;
  onChange: (s: StrategyState) => void;
}

const MODE_LABEL: Record<PriceMode, string> = {
  worst: 'Pitjor cas (compra a l’ask, venda al bid)',
  mid: 'Preu mitjà',
  last: 'Últim preu',
};

export function StrategyPanel({ market, chains, strategy, onChange }: Props) {
  const tpl = getTemplate(strategy.templateId);
  const groups = [...new Set(TEMPLATES.map((t) => t.group))];
  const expiries = chains.map((c) => c.expiry);

  const confirmOverwrite = () => !strategy.edited || confirm('Has editat les potes a mà. Vols substituir-les per la plantilla?');

  const rebuild = (patch: Partial<StrategyState>) => {
    const next = { ...strategy, ...patch };
    const legs = buildLegs(next, market, chains);
    onChange({ ...next, legs, edited: false });
  };

  const chooseTemplate = (id: string) => {
    if (!confirmOverwrite()) return;
    const t = getTemplate(id);
    const e1 = strategy.expiries.E1 && expiries.includes(strategy.expiries.E1) ? strategy.expiries.E1 : expiries[0] ?? '';
    const e2 = expiries[expiries.length - 1] ?? e1;
    const chainForStrikes = chains.find((c) => c.expiry === e1);
    if (id === 'custom') {
      onChange({ ...strategy, templateId: id, edited: true });
      return;
    }
    rebuild({ templateId: id, strikes: defaultStrikes(t, chainForStrikes, market.spot), expiries: { E1: e1, E2: e2 } });
  };

  const strikeOptions = (key: string) => {
    const usesE2 = tpl.legs.some((l) => l.strike === key && l.expiry === 'E2');
    const exp = usesE2 ? strategy.expiries.E2 : strategy.expiries.E1;
    return chains.find((c) => c.expiry === exp)?.rows.map((r) => r.strike) ?? [];
  };

  const updateLeg = (id: string, patch: Partial<Leg>, reprice: boolean) => {
    const legs = strategy.legs.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      if (reprice && next.kind === 'option') {
        const chain = chains.find((c) => c.expiry === next.expiry);
        const { price, iv } = priceLeg(market, chain, next.type, next.strike, next.expiry, next.qty > 0 ? 'buy' : 'sell', strategy.mode);
        if (price > 0) next.price = price;
        next.iv = iv;
      }
      if (reprice && next.kind === 'stock' && patch.kind === 'stock') {
        next.price = market.spot;
        next.qty = Math.sign(next.qty || 1) * market.multiplier;
      }
      return next;
    });
    onChange({ ...strategy, legs, edited: true, templateId: strategy.templateId });
  };

  const addLeg = () => {
    const expiry = strategy.expiries.E1 || expiries[0] || market.valuationDate;
    const strike = chains.find((c) => c.expiry === expiry)?.rows.reduce((b, r) => (Math.abs(r.strike - market.spot) < Math.abs(b - market.spot) ? r.strike : b), market.spot) ?? Math.round(market.spot);
    const { price, iv } = priceLeg(market, chains.find((c) => c.expiry === expiry), 'C', strike, expiry, 'buy', strategy.mode);
    onChange({ ...strategy, legs: [...strategy.legs, { id: newId(), kind: 'option', type: 'C', strike, expiry, qty: 1, price, iv }], edited: true });
  };

  const repriceAll = (mode: PriceMode) => {
    const legs = strategy.legs.map((l) => {
      if (l.kind === 'stock') return { ...l, price: market.spot };
      const { price, iv } = priceLeg(market, chains.find((c) => c.expiry === l.expiry), l.type, l.strike, l.expiry, l.qty > 0 ? 'buy' : 'sell', mode);
      return { ...l, price: price > 0 ? price : l.price, iv };
    });
    onChange({ ...strategy, mode, legs });
  };

  const cost = netCost(strategy.legs, market.multiplier);

  return (
    <section className="card">
      <h2>3 · Estratègia</h2>
      <div className="form-grid">
        <label className="span2">
          Tipus d’operació
          <select value={strategy.templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {TEMPLATES.filter((t) => t.group === g).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="hint span2">{tpl.description}</p>

        {tpl.id !== 'custom' && (
          <>
            {tpl.expiries.map((ek) => (
              <label key={ek}>
                {tpl.expiries.length > 1 ? (ek === 'E1' ? 'Venciment curt' : 'Venciment llarg') : 'Venciment'}
                <select value={strategy.expiries[ek] ?? ''} onChange={(e) => confirmOverwrite() && rebuild({ expiries: { ...strategy.expiries, [ek]: e.target.value } })}>
                  {!expiries.length && <option value="">— afegeix una cadena —</option>}
                  {expiries.map((x) => (
                    <option key={x} value={x}>
                      {dateCa(x)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {tpl.strikes.map((s) => {
              const opts = strikeOptions(s.key);
              const val = strategy.strikes[s.key] ?? market.spot;
              return (
                <label key={s.key}>
                  {s.label}
                  {opts.length > 0 ? (
                    <select value={val} onChange={(e) => confirmOverwrite() && rebuild({ strikes: { ...strategy.strikes, [s.key]: Number(e.target.value) } })}>
                      {!opts.includes(val) && <option value={val}>{val}</option>}
                      {opts.map((k) => (
                        <option key={k} value={k}>
                          {k} ({pct(k / market.spot - 1)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <NumInput value={val} onChange={(v) => v != null && v > 0 && rebuild({ strikes: { ...strategy.strikes, [s.key]: v } })} />
                  )}
                </label>
              );
            })}
            <label>
              Nombre d’unitats
              <NumInput value={strategy.units} min={1} onChange={(v) => v != null && v >= 1 && confirmOverwrite() && rebuild({ units: Math.round(v) })} />
            </label>
          </>
        )}
        <label className={tpl.id !== 'custom' ? '' : 'span2'}>
          Preu d’execució
          <select value={strategy.mode} onChange={(e) => repriceAll(e.target.value as PriceMode)}>
            {(Object.keys(MODE_LABEL) as PriceMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3>Potes</h3>
      <div className="table-wrap">
        <table className="legs">
          <thead>
            <tr>
              <th>Operació</th>
              <th>Tipus</th>
              <th>Strike</th>
              <th>Venciment</th>
              <th>Quantitat</th>
              <th>Preu</th>
              <th>IV %</th>
              <th>Import</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {strategy.legs.map((l) => {
              const isStock = l.kind === 'stock';
              const amount = (isStock ? l.qty * l.price : l.qty * l.price * market.multiplier) * -1;
              return (
                <tr key={l.id}>
                  <td>
                    <select className={l.qty > 0 ? 'buy' : 'sell'} value={l.qty > 0 ? 'buy' : 'sell'} onChange={(e) => updateLeg(l.id, { qty: (e.target.value === 'buy' ? 1 : -1) * Math.abs(l.qty) }, true)}>
                      <option value="buy">Compra</option>
                      <option value="sell">Venda</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={isStock ? 'S' : l.type}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'S') updateLeg(l.id, { kind: 'stock', iv: 0 }, true);
                        else updateLeg(l.id, { kind: 'option', type: v as 'C' | 'P', qty: Math.sign(l.qty) * (isStock ? 1 : Math.abs(l.qty)) }, true);
                      }}
                    >
                      <option value="C">Call</option>
                      <option value="P">Put</option>
                      <option value="S">Accions</option>
                    </select>
                  </td>
                  <td>{isStock ? <span className="muted">—</span> : <NumInput value={l.strike} onChange={(v) => v != null && v > 0 && updateLeg(l.id, { strike: v }, true)} width="5.5em" />}</td>
                  <td>
                    {isStock ? (
                      <span className="muted">—</span>
                    ) : (
                      <select value={l.expiry} onChange={(e) => updateLeg(l.id, { expiry: e.target.value }, true)}>
                        {!expiries.includes(l.expiry) && <option value={l.expiry}>{dateCa(l.expiry)}</option>}
                        {expiries.map((x) => (
                          <option key={x} value={x}>
                            {dateCa(x)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <NumInput value={Math.abs(l.qty)} min={0} onChange={(v) => v != null && updateLeg(l.id, { qty: Math.sign(l.qty || 1) * v }, false)} width="4.5em" />
                    <span className="muted unit">{isStock ? 'acc.' : 'contr.'}</span>
                  </td>
                  <td>
                    <NumInput value={l.price} min={0} onChange={(v) => v != null && updateLeg(l.id, { price: v }, false)} width="5.5em" />
                  </td>
                  <td>{isStock ? <span className="muted">—</span> : <NumInput value={l.iv} scale={100} min={0} onChange={(v) => v != null && updateLeg(l.id, { iv: v }, false)} width="4.5em" />}</td>
                  <td className={`numcell ${amount >= 0 ? 'pos' : 'neg'}`}>{money(amount, { plus: true })}</td>
                  <td>
                    <button type="button" className="icon" title="Eliminar pota" onClick={() => onChange({ ...strategy, legs: strategy.legs.filter((x) => x.id !== l.id), edited: true })}>
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
            {strategy.legs.length === 0 && (
              <tr>
                <td colSpan={9} className="muted center">
                  Cap pota. Tria una plantilla o afegeix-ne una.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="inline spread">
        <span className="inline">
          <button type="button" className="ghost small" onClick={addLeg}>
            + Afegir pota
          </button>
          <button type="button" className="ghost small" onClick={() => repriceAll(strategy.mode)} title="Torna a llegir preus i IV de la cadena">
            Reomplir preus
          </button>
        </span>
        <strong className={cost > 0 ? 'neg' : 'pos'}>{cost > 0 ? `Pagues ${money(cost)}` : `Cobres ${money(-cost)}`}</strong>
      </div>
    </section>
  );
}
