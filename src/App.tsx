import { useMemo, useRef } from 'react';
import { analyze } from './engine/analysis';
import { Compare } from './components/Compare';
import { ChainPanel } from './components/ChainPanel';
import { MarketPanel } from './components/MarketPanel';
import { Results } from './components/Results';
import { StrategyPanel } from './components/StrategyPanel';
import { blankState, exampleState, isAppState, useAppState } from './state/store';

export default function App() {
  const [state, setState] = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);
  const { market, chains, strategy, config } = state;
  const activeChain = chains.find((c) => c.expiry === state.activeExpiry) ?? chains[0];

  const analysis = useMemo(() => {
    if (strategy.legs.length === 0 || !(market.spot > 0)) return null;
    try {
      return analyze(strategy.legs, market, config);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [strategy.legs, market, config]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `opcions-${market.ticker || 'estrategia'}-${market.valuationDate}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!isAppState(parsed)) throw new Error('format');
      setState({ ...parsed, config: { ...config, ...parsed.config } });
    } catch {
      alert('Aquest fitxer no és una exportació vàlida de l’eina.');
    }
  };

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Opcions Asimètriques</h1>
          <p className="muted">Calculadora d’estratègies amb opcions: cost, risc, marge i guany/pèrdua segons el preu del subjacent.</p>
        </div>
        <div className="inline wrap">
          <button type="button" className="ghost small" onClick={() => confirm('Començar de zero? Es perdrà la cadena i l’estratègia actuals (no les desades).') && setState({ ...blankState(), saved: state.saved })}>
            Nou
          </button>
          <button type="button" className="ghost small" onClick={() => confirm('Carregar l’exemple de GOOGL (des. 2028)?') && setState({ ...exampleState(), saved: state.saved })}>
            Exemple GOOGL
          </button>
          <button type="button" className="ghost small" onClick={exportJson}>
            Exportar
          </button>
          <button type="button" className="ghost small" onClick={() => fileRef.current?.click()}>
            Importar
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
      </header>

      <div className="grid-2">
        <MarketPanel market={market} chain={activeChain} onChange={(m) => setState((s) => ({ ...s, market: m }))} />
        <StrategyPanel market={market} chains={chains} strategy={strategy} onChange={(st) => setState((s) => ({ ...s, strategy: st }))} />
      </div>

      <ChainPanel
        market={market}
        chains={chains}
        activeExpiry={activeChain?.expiry ?? ''}
        onActive={(e) => setState((s) => ({ ...s, activeExpiry: e }))}
        onChains={(cs, active) =>
          setState((s) => {
            const exp = active ?? s.activeExpiry;
            const first = cs[0]?.expiry ?? '';
            const ex = s.strategy.expiries;
            return {
              ...s,
              chains: cs,
              activeExpiry: exp,
              strategy: { ...s.strategy, expiries: { E1: ex.E1 && cs.some((c) => c.expiry === ex.E1) ? ex.E1 : first, E2: ex.E2 && cs.some((c) => c.expiry === ex.E2) ? ex.E2 : cs[cs.length - 1]?.expiry ?? first } },
            };
          })
        }
      />

      {analysis ? (
        <Results a={analysis} market={market} config={config} onConfig={(c) => setState((s) => ({ ...s, config: c }))} />
      ) : (
        <section className="card">
          <h2>4 · Resultats</h2>
          <p className="muted">Afegeix almenys una pota a l’estratègia per veure l’anàlisi.</p>
        </section>
      )}

      <Compare
        saved={state.saved}
        config={config}
        current={{ market, legs: strategy.legs, templateId: strategy.templateId }}
        onSave={(sv) => setState((s) => ({ ...s, saved: [...s.saved, sv] }))}
        onDelete={(id) => setState((s) => ({ ...s, saved: s.saved.filter((x) => x.id !== id) }))}
        onLoad={(sv) => setState((s) => ({ ...s, market: { ...sv.market }, strategy: { ...s.strategy, templateId: sv.templateId, legs: sv.legs.map((l) => ({ ...l })), edited: true } }))}
      />

      <footer className="muted small">
        Eina de càlcul educativa; no és assessorament financer. Valoracions amb Black-Scholes (opcions europees, IV constant per pota) i marge aproximat. Les dades es guarden només en aquest navegador.
      </footer>
    </div>
  );
}
