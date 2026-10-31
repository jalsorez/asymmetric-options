# Opcions Asimètriques

Calculadora web d’estratègies amb opcions per a qualsevol acció: introdueixes (o enganxes) la cadena d’opcions del broker, tries l’operació i obtens cost, guany/pèrdua màxims, breakevens, marge estimat d’IB, grecs, probabilitats, la matriu de guanys/pèrdues al venciment, el valor abans del venciment, proves d’estrès i un comparador d’estratègies.

Tot el càlcul es fa al navegador; les dades es guarden només a `localStorage` (exportables en JSON).

## Ús

1. **Subjacent:** ticker, preu (o “Per paritat” per deduir-lo de la cadena), tipus d’interès, dividend.
2. **Cadena d’opcions:** afegeix un venciment i enganxa la taula copiada del broker
   (`call: last change bid ask volum OI | strike | put: …`) o un CSV amb capçalera
   (`strike,call_bid,call_ask,put_bid,put_ask` o `type,strike,bid,ask`). També es pot editar a mà.
3. **Estratègia:** tria una plantilla (spreads, venda de puts, risk reversal, collar, iron condor, diagonal…) o el mode lliure; els preus s’omplen sols (pitjor cas, mitjà o últim) i es poden editar.
4. **Resultats** i **Comparador**.

## Desenvolupament

```bash
npm install
npm run dev     # servidor local
npm test        # tests del motor de càlcul (Vitest)
npm run build   # build de producció a dist/
```

Estructura:

- `src/engine/` — lògica pura: Black-Scholes i IV, paritat put-call, payoff, marge Reg T, plantilles, anàlisi.
- `src/parse/chainParser.ts` — parser de cadenes enganxades.
- `src/components/` — interfície (React).
- `tests/` — tests amb les dades reals de MSTR i GOOGL.

## Desplegament

Projecte Vite estàtic preparat per a Vercel (`vercel.json`): importa el repositori a vercel.com i cada push a `main` es desplega automàticament.

## Limitacions

Valoració amb Black-Scholes (europees, IV constant per pota). El marge és una aproximació de les regles Reg T d’Interactive Brokers. No és assessorament financer.
