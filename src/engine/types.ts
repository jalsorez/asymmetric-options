export type OptType = 'C' | 'P';

/** Bid/ask/last quote for one side (call or put) of a strike. */
export interface Quote {
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume?: number | null;
  oi?: number | null;
}

export interface ChainRow {
  strike: number;
  call: Quote;
  put: Quote;
}

/** Option chain for a single expiry date (ISO yyyy-mm-dd). */
export interface Chain {
  expiry: string;
  rows: ChainRow[];
}

export interface Market {
  ticker: string;
  spot: number;
  /** Risk-free rate, decimal (0.04 = 4 %). */
  rate: number;
  /** Continuous dividend yield, decimal. */
  dividend: number;
  /** Valuation date, ISO yyyy-mm-dd. */
  valuationDate: string;
  /** Shares per contract (normally 100). */
  multiplier: number;
}

export type LegKind = 'option' | 'stock';

export interface Leg {
  id: string;
  kind: LegKind;
  /** Option type; ignored for stock legs. */
  type: OptType;
  strike: number;
  /** ISO expiry date; ignored for stock legs. */
  expiry: string;
  /** Positive = long (buy), negative = short (sell). Contracts for options, shares for stock. */
  qty: number;
  /** Fill price per share (premium for options, share price for stock). */
  price: number;
  /** Implied volatility (decimal) used to value the leg before expiry. */
  iv: number;
}

export type PriceMode = 'worst' | 'mid' | 'last';
