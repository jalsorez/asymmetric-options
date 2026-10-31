const nf0 = new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('ca-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const MINUS = '−';

function sign(x: number, s: string, forcePlus: boolean) {
  if (x < 0) return MINUS + s;
  return forcePlus && x > 0 ? `+${s}` : s;
}

/** "−2.100 $" / "+7.900 $" */
export function money(x: number | null | undefined, opts: { plus?: boolean; decimals?: boolean } = {}): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const v = Math.abs(x) < 0.005 ? 0 : x;
  const s = (opts.decimals ? nf2 : nf0).format(Math.abs(v));
  return `${sign(v, s, !!opts.plus)} $`;
}

export function price(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return (x < 0 ? MINUS : '') + nf2.format(Math.abs(x));
}

/** 0.2345 → "+23 %" */
export function pct(x: number | null | undefined, opts: { plus?: boolean; decimals?: number } = {}): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const v = x * 100;
  const s = (opts.decimals === 1 ? nf1 : nf0).format(Math.abs(v));
  return `${sign(Math.round(v * 10) / 10 === 0 ? 0 : v, s, opts.plus ?? true)} %`;
}

export function num(x: number | null | undefined, decimals = 2): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const f = decimals === 0 ? nf0 : decimals === 1 ? nf1 : nf2;
  return (x < 0 ? MINUS : '') + f.format(Math.abs(x));
}

export function dateCa(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const mon = ['gen', 'febr', 'març', 'abr', 'maig', 'juny', 'jul', 'ag', 'set', 'oct', 'nov', 'des'][m - 1] ?? '';
  return `${d} ${mon} ${y}`;
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const mon = ['gen', 'febr', 'març', 'abr', 'maig', 'juny', 'jul', 'ag', 'set', 'oct', 'nov', 'des'][m - 1] ?? '';
  return `${d} ${mon} ${String(y).slice(2)}`;
}

export function tone(x: number | null | undefined): 'pos' | 'neg' | 'flat' {
  if (x == null || !Number.isFinite(x) || Math.abs(x) < 0.005) return 'flat';
  return x > 0 ? 'pos' : 'neg';
}

/** Background tint proportional to |x| / scale, for heat-map cells. */
export function heat(x: number, scale: number): React.CSSProperties {
  if (!Number.isFinite(x) || scale <= 0 || Math.abs(x) < 0.005) return {};
  const a = Math.min(1, Math.abs(x) / scale) * 0.32 + 0.04;
  return { background: x > 0 ? `rgb(var(--pos-rgb) / ${a})` : `rgb(var(--neg-rgb) / ${a})` };
}
