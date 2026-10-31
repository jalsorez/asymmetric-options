import type { ChainRow, Quote } from '../engine/types';

/**
 * Parses an option chain pasted from a broker page.
 *
 * Supported inputs:
 *  1. Broker layout (as in IB / Nasdaq style tables): per strike
 *     [date] call: last change bid ask volume OI | strike | put: last change bid ask volume OI
 *     Cells may be separated by tabs, spaces or newlines; '--' means empty; arrows are ignored.
 *  2. CSV/TSV with a header row naming the columns, e.g.
 *     strike,call_bid,call_ask,call_last,put_bid,put_ask,put_last
 *     or one row per option: type,strike,bid,ask,last
 */

export interface ParseResult {
  rows: ChainRow[];
  format: 'broker' | 'header' | 'none';
  warnings: string[];
}

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Gen|Febr|Març|Abr|Maig|Juny|Jul|Ag|Set|Oct|Nov|Des';
const DATE_RE = new RegExp(`(?:^|\\s)(?:${MONTHS})[a-zç]*\\.?\\s+\\d{1,2}(?:,?\\s+\\d{2,4})?(?=\\s|$)`, 'gi');

function parseNum(tok: string): number | null | undefined {
  const t = tok.trim().replace(/[▲▼↑↓]/g, '');
  if (t === '') return undefined;
  if (/^[-–—]{1,2}$/.test(t) || /^n\/?a$/i.test(t)) return null;
  let s = t.replace(/[$€%]/g, '');
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^[+-]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function emptyQuote(): Quote {
  return { bid: null, ask: null, last: null, volume: null, oi: null };
}

function tokensOf(segment: string): (number | null)[] {
  const out: (number | null)[] = [];
  for (const tok of segment.split(/[\t\n\r ]+/)) {
    const v = parseNum(tok);
    if (v !== undefined) out.push(v);
  }
  return out;
}

function quote6(t: (number | null)[]): Quote {
  // last, change, bid, ask, volume, OI
  return { last: t[0], bid: t[2], ask: t[3], volume: t[4], oi: t[5] };
}

function parseBroker(text: string): ChainRow[] {
  // Split into one record per strike. Prefer the date marker that starts every row.
  let records: string[];
  const dateHits = text.match(DATE_RE);
  if (dateHits && dateHits.length >= 2) {
    records = text.split(DATE_RE).map((s) => s.trim()).filter(Boolean);
  } else {
    records = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  const rows: ChainRow[] = [];
  for (const rec of records) {
    const t = tokensOf(rec);
    if (t.length === 13 && t[6] != null && t[6] > 0) {
      rows.push({ strike: t[6], call: quote6(t.slice(0, 6)), put: quote6(t.slice(7, 13)) });
    } else if (t.length === 7 && t[6] != null && t[6] > 0) {
      // Calls only (strike last).
      rows.push({ strike: t[6], call: quote6(t.slice(0, 6)), put: emptyQuote() });
    } else if (t.length === 7 && t[0] != null && t[0] > 0) {
      // Puts only (strike first).
      rows.push({ strike: t[0], call: emptyQuote(), put: quote6(t.slice(1, 7)) });
    }
  }
  return rows;
}

const ALIASES: Record<string, string> = {
  strike: 'strike', k: 'strike', preu_exercici: 'strike',
  type: 'type', tipus: 'type', right: 'type', cp: 'type',
  bid: 'bid', ask: 'ask', last: 'last', volume: 'volume', vol: 'volume', oi: 'oi', open_interest: 'oi', openint: 'oi',
};

function normHeader(h: string): string {
  const s = h.trim().toLowerCase().replace(/[.\s-]+/g, '_');
  const m = s.match(/^(call|put|c|p)_(.+)$/);
  if (m) {
    const side = m[1].startsWith('c') ? 'call' : 'put';
    return `${side}_${ALIASES[m[2]] ?? m[2]}`;
  }
  return ALIASES[s] ?? s;
}

function parseHeader(text: string): ChainRow[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(normHeader);
  if (!headers.includes('strike')) return null;
  const byStrike = new Map<number, ChainRow>();
  const get = (strike: number) => {
    let r = byStrike.get(strike);
    if (!r) {
      r = { strike, call: emptyQuote(), put: emptyQuote() };
      byStrike.set(strike, r);
    }
    return r;
  };
  for (const line of lines.slice(1)) {
    const cells = line.split(sep);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => (rec[h] = cells[i] ?? ''));
    const strike = parseNum(rec.strike);
    if (strike == null || strike <= 0) continue;
    const row = get(strike);
    const num = (k: string) => {
      const v = parseNum(rec[k] ?? '');
      return v === undefined ? null : v;
    };
    if ('type' in rec) {
      const side = /^c/i.test(rec.type.trim()) ? row.call : row.put;
      side.bid = num('bid');
      side.ask = num('ask');
      side.last = num('last');
      side.volume = num('volume');
      side.oi = num('oi');
    } else {
      for (const side of ['call', 'put'] as const) {
        const q = row[side];
        q.bid = num(`${side}_bid`) ?? q.bid;
        q.ask = num(`${side}_ask`) ?? q.ask;
        q.last = num(`${side}_last`) ?? q.last;
        q.volume = num(`${side}_volume`) ?? q.volume;
        q.oi = num(`${side}_oi`) ?? q.oi;
      }
    }
  }
  return [...byStrike.values()];
}

export function parseChain(text: string): ParseResult {
  const warnings: string[] = [];
  const header = parseHeader(text);
  if (header && header.length > 0) {
    return { rows: header.sort((a, b) => a.strike - b.strike), format: 'header', warnings };
  }
  const rows = parseBroker(text);
  if (rows.length === 0) {
    warnings.push('No s’ha reconegut cap fila. Format esperat: last, change, bid, ask, volum, OI (calls) | strike | el mateix per a puts.');
    return { rows, format: 'none', warnings };
  }
  rows.sort((a, b) => a.strike - b.strike);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].strike === rows[i - 1].strike) warnings.push(`Strike duplicat: ${rows[i].strike}`);
  }
  for (const r of rows) {
    for (const [name, q] of [['call', r.call], ['put', r.put]] as const) {
      if (q.bid != null && q.ask != null && q.bid > q.ask) warnings.push(`Strike ${r.strike} (${name}): bid > ask`);
    }
  }
  return { rows, format: 'broker', warnings };
}

/** Merge new rows into existing ones (new values replace old for the same strike). */
export function mergeRows(existing: ChainRow[], incoming: ChainRow[]): ChainRow[] {
  const map = new Map(existing.map((r) => [r.strike, r]));
  for (const r of incoming) map.set(r.strike, r);
  return [...map.values()].sort((a, b) => a.strike - b.strike);
}
