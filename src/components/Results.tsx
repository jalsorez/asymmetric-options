import type { Analysis, AnalysisConfig, Scenario } from '../engine/analysis';
import type { Market } from '../engine/types';
import { dateCa, heat, money, num, pct, price, shortDate, tone } from '../format';
import { NumInput } from './NumInput';
import { PayoffChart } from './PayoffChart';

interface Props {
  a: Analysis;
  market: Market;
  config: AnalysisConfig;
  onConfig: (c: AnalysisConfig) => void;
}

function Stat({ label, value, sub, t }: { label: string; value: string; sub?: string; t?: 'pos' | 'neg' | 'flat' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${t ?? ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Results({ a, market, config, onConfig }: Props) {
  const set = (patch: Partial<AnalysisConfig>) => onConfig({ ...config, ...patch });
  const scale = Math.max(1, ...a.matrix.map((r) => Math.abs(r.pnl)));
  const tScale = Math.max(1, ...a.timeMatrix.flatMap((r) => r.values.map(Math.abs)));
  const debit = a.cost > 0;

  return (
    <section className="card results">
      <h2>4 · Resultats</h2>
      <p className="hint">
        Horitzó d’anàlisi: <strong>{dateCa(a.horizon)}</strong> ({num(a.T, 2)} anys). Retorns calculats sobre la <strong>{a.riskBaseLabel}</strong> ({money(a.riskBase)}).
      </p>

      <div className="stats">
        <Stat label={debit ? 'Cost (pagues)' : 'Crèdit (cobres)'} value={money(Math.abs(a.cost))} t={debit ? 'neg' : 'pos'} />
        <Stat label="Guany màxim" value={a.ext.unlimitedProfit ? 'Il·limitat' : money(a.ext.maxProfit, { plus: true })} sub={a.returnOnRisk != null ? `${pct(a.returnOnRisk)} sobre ${a.riskBaseLabel}` : undefined} t="pos" />
        <Stat label="Pèrdua màxima" value={a.ext.unlimitedLoss ? 'Il·limitada' : money(-a.ext.maxLoss)} t="neg" sub={a.ext.unlimitedLoss ? 'Risc obert a l’alça' : undefined} />
        <Stat label="Breakeven" value={a.breakevens.length ? a.breakevens.map((b) => price(b)).join(' · ') : '—'} sub={a.breakevens.length ? a.breakevens.map((b) => pct(b / market.spot - 1)).join(' · ') : undefined} />
        <Stat label="Marge estimat (IB Reg T)" value={money(a.margin.requirement)} sub={a.margin.nakedCount > 0 ? `${a.margin.nakedCount} contracte(s) nus` : 'Risc definit'} />
        <Stat label="Probabilitat de guany" value={pct(a.pop, { plus: false })} sub={`neutral al risc · IV ${pct(a.probIv, { plus: false, decimals: 1 })}`} />
        <Stat label="Delta" value={`${num(a.greeks.delta, 0)} acc.`} sub={`equiv. ${money(a.greeks.delta * market.spot)}`} />
        <Stat label="Theta / Vega" value={`${money(a.greeks.theta, { plus: true, decimals: true })}/dia`} sub={`Vega ${money(a.greeks.vega, { plus: true, decimals: true })} per punt d’IV`} />
      </div>

      <PayoffChart a={a} spot={market.spot} />

      <h3>Guany i pèrdua al venciment</h3>
      <div className="controls">
        <label>
          Des de (%)
          <NumInput value={config.rangeFrom} onChange={(v) => v != null && set({ rangeFrom: v })} width="5em" />
        </label>
        <label>
          Fins a (%)
          <NumInput value={config.rangeTo} onChange={(v) => v != null && set({ rangeTo: v })} width="5em" />
        </label>
        <label>
          Pas (%)
          <NumInput value={config.rangeStep} min={0.5} onChange={(v) => v != null && v >= 0.5 && set({ rangeStep: v })} width="5em" />
        </label>
        <label className="check">
          <input type="checkbox" checked={config.includeKeyPoints} onChange={(e) => set({ includeKeyPoints: e.target.checked })} />
          Afegir strikes i breakevens
        </label>
      </div>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Preu subjacent</th>
              <th>Variació</th>
              <th>Guany / pèrdua</th>
              <th>% s/ {a.riskBaseLabel}</th>
              <th title="Probabilitat neutral al risc que el subjacent acabi per sobre d’aquest preu">P(acabar per sobre)</th>
            </tr>
          </thead>
          <tbody>
            {a.matrix.map((r) => (
              <tr key={r.price} className={r.key ? 'keyrow' : ''}>
                <td>
                  {price(r.price)} {r.key && <span className="tag">{r.key}</span>}
                </td>
                <td className="muted">{pct(r.move)}</td>
                <td className={`numcell ${tone(r.pnl)}`} style={heat(r.pnl, scale)}>
                  {money(r.pnl, { plus: true })}
                </td>
                <td className={`numcell ${tone(r.pnl)}`}>{pct(r.ret)}</td>
                <td className="muted numcell">{pct(r.probAbove, { plus: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Valor estimat abans del venciment</h3>
      <p className="hint">Guany/pèrdua si tanques la posició en cada data (Black-Scholes amb la IV de cada pota{config.ivShift ? `, ${pct(config.ivShift, { decimals: 1 })} d’IV` : ''}). L’última columna és el venciment.</p>
      <div className="controls">
        <label>
          Columnes
          <NumInput value={config.timeColumns} min={2} onChange={(v) => v != null && v >= 2 && set({ timeColumns: Math.min(10, Math.round(v)) })} width="4em" />
        </label>
        <label>
          Canvi d’IV (punts)
          <NumInput value={config.ivShift} scale={100} onChange={(v) => v != null && set({ ivShift: v })} width="4em" />
        </label>
      </div>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Preu</th>
              {a.timeDates.map((d, i) => (
                <th key={d}>{i === 0 ? 'Avui' : i === a.timeDates.length - 1 ? `Venc. ${shortDate(d)}` : shortDate(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.timeMatrix.map((r) => (
              <tr key={r.price}>
                <td>
                  {price(r.price)} <span className="muted">{pct(r.move)}</span>
                </td>
                {r.values.map((v, i) => (
                  <td key={i} className={`numcell ${tone(v)}`} style={heat(v, tScale)}>
                    {money(v, { plus: true })}
                    {a.riskBase > 0 && <span className="cellpct">{pct(v / a.riskBase)}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Prova d’estrès i risc de crida de marge</h3>
      <div className="controls">
        <label>
          Moviments (%)
          <input
            defaultValue={config.stressMoves.join(', ')}
            onBlur={(e) => {
              const moves = e.target.value.split(/[,;\s]+/).map((s) => Number(s.replace(',', '.'))).filter((x) => Number.isFinite(x) && x > -100);
              if (moves.length) set({ stressMoves: moves });
            }}
            style={{ width: '12em' }}
          />
        </label>
        <label>
          D’aquí a (dies)
          <NumInput value={config.stressDays} min={0} onChange={(v) => v != null && set({ stressDays: Math.round(v) })} width="4em" />
        </label>
        <label>
          IV extra en caigudes (punts)
          <NumInput value={config.stressIvUp} scale={100} onChange={(v) => v != null && set({ stressIvUp: v })} width="4em" />
        </label>
        <label>
          Excés de liquiditat actual ($)
          <NumInput value={config.liquidity} allowEmpty placeholder="opcional" onChange={(v) => set({ liquidity: v })} width="8em" />
        </label>
      </div>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Moviment</th>
              <th>Preu</th>
              <th>P&L sobre el paper</th>
              <th>Marge requerit</th>
              <th>Impacte en liquiditat</th>
              {config.liquidity != null && <th>Excés de liquiditat després</th>}
            </tr>
          </thead>
          <tbody>
            {a.stress.map((s) => (
              <tr key={s.move}>
                <td className={tone(s.move)}>{pct(s.move / 100)}</td>
                <td>{price(s.price)}</td>
                <td className={`numcell ${tone(s.pnl)}`}>
                  {money(s.pnl, { plus: true })} {a.riskBase > 0 && <span className="cellpct">{pct(s.pnl / a.riskBase)}</span>}
                </td>
                <td className="numcell">{money(s.margin.requirement)}</td>
                <td className="numcell">{money(-s.margin.liquidityImpact)}</td>
                {config.liquidity != null && (
                  <td className={`numcell ${s.liquidityAfter! < 0 ? 'neg strong' : ''}`}>
                    {money(s.liquidityAfter)} {s.liquidityAfter! < 0 && <span className="tag danger">Crida de marge</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Marge estimat amb les regles Reg T d’IB: spreads = pèrdua màxima; opcions nues = valor + màx(20 % del subjacent − part fora de diners, 10 %); accions = 50 % inicial / 25 % manteniment. Amb Portfolio Margin sol ser
        menys. És una aproximació: comprova sempre el valor real a TWS abans d’operar.
      </p>

      <Scenarios a={a} config={config} onChange={(scenarios) => set({ scenarios })} />
    </section>
  );
}

function Scenarios({ a, config, onChange }: { a: Analysis; config: AnalysisConfig; onChange: (s: Scenario[]) => void }) {
  const upd = (i: number, patch: Partial<Scenario>) => onChange(config.scenarios.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const total = config.scenarios.reduce((x, s) => x + Math.max(0, s.prob), 0);
  return (
    <>
      <h3>Escenaris de la teva tesi</h3>
      <p className="hint">Defineix escenaris al venciment amb la probabilitat que hi assignes; es calcula el resultat esperat.</p>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Escenari</th>
              <th>Moviment (%)</th>
              <th>Probabilitat (%)</th>
              <th>Preu</th>
              <th>P&L</th>
              <th>% s/ {a.riskBaseLabel}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {a.scenarios.map((s, i) => (
              <tr key={i}>
                <td>
                  <input value={s.label} onChange={(e) => upd(i, { label: e.target.value })} style={{ width: '9em' }} />
                </td>
                <td>
                  <NumInput value={s.move} onChange={(v) => v != null && v > -100 && upd(i, { move: v })} width="5em" />
                </td>
                <td>
                  <NumInput value={s.prob} min={0} onChange={(v) => v != null && upd(i, { prob: v })} width="5em" />
                </td>
                <td>{price(s.price)}</td>
                <td className={`numcell ${tone(s.pnl)}`}>{money(s.pnl, { plus: true })}</td>
                <td className={`numcell ${tone(s.pnl)}`}>{pct(s.ret)}</td>
                <td>
                  <button type="button" className="icon" onClick={() => onChange(config.scenarios.filter((_, j) => j !== i))} title="Eliminar escenari">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                <button type="button" className="ghost small" onClick={() => onChange([...config.scenarios, { label: 'Nou escenari', move: -20, prob: 0 }])}>
                  + Escenari
                </button>
              </td>
              <td className={Math.abs(total - 100) > 0.01 ? 'warn' : 'muted'}>{num(total, 0)} %{Math.abs(total - 100) > 0.01 ? ' (es normalitza)' : ''}</td>
              <td>
                <strong>Esperat</strong>
              </td>
              <td className={`numcell ${tone(a.ev)}`}>
                <strong>{money(a.ev, { plus: true })}</strong>
              </td>
              <td className={`numcell ${tone(a.ev)}`}>
                <strong>{pct(a.evRet)}</strong>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
