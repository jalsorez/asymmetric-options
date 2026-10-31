import { useState } from 'react';
import { yearFrac } from '../engine/blackScholes';
import { emptyQuote, quoteIv } from '../engine/chain';
import type { Chain, ChainRow, Market, Quote } from '../engine/types';
import { dateCa, num, pct } from '../format';
import { mergeRows, parseChain } from '../parse/chainParser';
import { NumInput } from './NumInput';

interface Props {
  market: Market;
  chains: Chain[];
  activeExpiry: string;
  onChains: (chains: Chain[], active?: string) => void;
  onActive: (expiry: string) => void;
}

export function ChainPanel({ market, chains, activeExpiry, onChains, onActive }: Props) {
  const [newExpiry, setNewExpiry] = useState('');
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<{ text: string; warn?: boolean } | null>(null);
  const [open, setOpen] = useState(true);
  const chain = chains.find((c) => c.expiry === activeExpiry);

  const updateChain = (rows: ChainRow[]) => {
    onChains(chains.map((c) => (c.expiry === activeExpiry ? { ...c, rows } : c)));
  };

  const addExpiry = () => {
    if (!newExpiry) return;
    if (!chains.some((c) => c.expiry === newExpiry)) {
      onChains([...chains, { expiry: newExpiry, rows: [] }].sort((a, b) => a.expiry.localeCompare(b.expiry)), newExpiry);
    } else onActive(newExpiry);
    setNewExpiry('');
  };

  const removeExpiry = () => {
    if (!chain || !confirm(`Eliminar la cadena del ${dateCa(chain.expiry)}?`)) return;
    const rest = chains.filter((c) => c.expiry !== chain.expiry);
    onChains(rest, rest[0]?.expiry ?? '');
  };

  const importPaste = (replace: boolean) => {
    if (!chain) return setMsg({ text: 'Primer afegeix una data de venciment.', warn: true });
    const r = parseChain(paste);
    if (r.rows.length === 0) return setMsg({ text: r.warnings.join(' '), warn: true });
    updateChain(replace ? r.rows : mergeRows(chain.rows, r.rows));
    setMsg({
      text: `Importats ${r.rows.length} strikes (${r.format === 'header' ? 'CSV amb capçalera' : 'format broker'}).` + (r.warnings.length ? ` Avisos: ${r.warnings.slice(0, 4).join('; ')}` : ''),
      warn: r.warnings.length > 0,
    });
    setPaste('');
  };

  const setQuote = (strike: number, side: 'call' | 'put', field: keyof Quote, v: number | null) => {
    if (!chain) return;
    updateChain(chain.rows.map((r) => (r.strike === strike ? { ...r, [side]: { ...r[side], [field]: v } } : r)));
  };

  const addRow = () => {
    if (!chain) return;
    const last = chain.rows[chain.rows.length - 1]?.strike ?? Math.round(market.spot);
    updateChain([...chain.rows, { strike: last + 5, call: emptyQuote(), put: emptyQuote() }]);
  };

  const setStrike = (old: number, v: number | null) => {
    if (!chain || v == null || v <= 0 || chain.rows.some((r) => r.strike === v)) return;
    updateChain(chain.rows.map((r) => (r.strike === old ? { ...r, strike: v } : r)).sort((a, b) => a.strike - b.strike));
  };

  const T = chain ? yearFrac(market.valuationDate, chain.expiry) : 0;

  return (
    <section className="card">
      <div className="card-head">
        <h2>2 · Cadena d’opcions</h2>
        <button type="button" className="ghost small" onClick={() => setOpen(!open)}>
          {open ? 'Amagar' : 'Mostrar'}
        </button>
      </div>

      <div className="tabs" role="tablist">
        {chains.map((c) => (
          <button key={c.expiry} role="tab" aria-selected={c.expiry === activeExpiry} className={c.expiry === activeExpiry ? 'tab active' : 'tab'} onClick={() => onActive(c.expiry)}>
            {dateCa(c.expiry)} <span className="muted">· {c.rows.length}</span>
          </button>
        ))}
        <span className="inline">
          <input type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} aria-label="Nova data de venciment" />
          <button type="button" className="small" onClick={addExpiry} disabled={!newExpiry}>
            + Venciment
          </button>
        </span>
      </div>

      {open && (
        <>
          {chain ? (
            <p className="hint">
              Venciment {dateCa(chain.expiry)} · {num(T, 2)} anys fins al venciment.{' '}
              <button type="button" className="link danger" onClick={removeExpiry}>
                Eliminar aquest venciment
              </button>
            </p>
          ) : (
            <p className="hint">Afegeix una data de venciment per començar a introduir opcions.</p>
          )}

          <details className="paste" open={!chain || chain.rows.length === 0}>
            <summary>Enganxar cadena des del broker</summary>
            <p className="hint">
              Copia la taula de la web del broker i enganxa-la aquí. Format reconegut: <code>call: last · change · bid · ask · volum · OI | strike | put: el mateix</code> (amb tabuladors, espais o una cel·la per
              línia). També accepta CSV amb capçalera, p. ex. <code>strike,call_bid,call_ask,put_bid,put_ask</code> o <code>type,strike,bid,ask</code>.
            </p>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder="Dec 15   67.65  +0.86   63.80  67.65  3  1024   120.00   37.25  +2.95  36.65  38.45  4  1291 …" />
            <div className="inline">
              <button type="button" onClick={() => importPaste(false)} disabled={!paste.trim()}>
                Afegir / actualitzar strikes
              </button>
              <button type="button" className="ghost" onClick={() => importPaste(true)} disabled={!paste.trim()}>
                Substituir la cadena
              </button>
            </div>
          </details>
          {msg && <p className={msg.warn ? 'hint warn' : 'hint ok'}>{msg.text}</p>}

          {chain && chain.rows.length > 0 && (
            <div className="table-wrap chain-table">
              <table>
                <thead>
                  <tr>
                    <th colSpan={4} className="side-head">
                      Calls
                    </th>
                    <th rowSpan={2}>Strike</th>
                    <th colSpan={4} className="side-head">
                      Puts
                    </th>
                    <th rowSpan={2} />
                  </tr>
                  <tr>
                    <th>Bid</th>
                    <th>Ask</th>
                    <th>Last</th>
                    <th>IV</th>
                    <th>Bid</th>
                    <th>Ask</th>
                    <th>Last</th>
                    <th>IV</th>
                  </tr>
                </thead>
                <tbody>
                  {chain.rows.map((r) => {
                    const civ = quoteIv(market, chain.expiry, r.strike, 'C', r.call);
                    const piv = quoteIv(market, chain.expiry, r.strike, 'P', r.put);
                    const callItm = r.strike < market.spot;
                    return (
                      <tr key={r.strike}>
                        {(['bid', 'ask', 'last'] as const).map((f) => (
                          <td key={`c${f}`} className={callItm ? 'itm' : ''}>
                            <NumInput value={r.call[f]} allowEmpty onChange={(v) => setQuote(r.strike, 'call', f, v)} ariaLabel={`Call ${r.strike} ${f}`} />
                          </td>
                        ))}
                        <td className={`iv ${callItm ? 'itm' : ''}`}>{pct(civ, { plus: false, decimals: 1 })}</td>
                        <td className="strike">
                          <NumInput value={r.strike} onChange={(v) => setStrike(r.strike, v)} ariaLabel="Strike" />
                        </td>
                        {(['bid', 'ask', 'last'] as const).map((f) => (
                          <td key={`p${f}`} className={!callItm ? 'itm' : ''}>
                            <NumInput value={r.put[f]} allowEmpty onChange={(v) => setQuote(r.strike, 'put', f, v)} ariaLabel={`Put ${r.strike} ${f}`} />
                          </td>
                        ))}
                        <td className={`iv ${!callItm ? 'itm' : ''}`}>{pct(piv, { plus: false, decimals: 1 })}</td>
                        <td>
                          <button type="button" className="icon" title="Eliminar strike" onClick={() => updateChain(chain.rows.filter((x) => x.strike !== r.strike))}>
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {chain && (
            <button type="button" className="ghost small" onClick={addRow}>
              + Afegir strike
            </button>
          )}
        </>
      )}
    </section>
  );
}
