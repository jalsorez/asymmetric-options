import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analysis } from '../engine/analysis';
import { money, price, shortDate } from '../format';

interface Props {
  a: Analysis;
  spot: number;
}

export function PayoffChart({ a, spot }: Props) {
  const fmtAxis = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : String(Math.round(v)));
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={a.chart} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
          <XAxis dataKey="price" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => String(Math.round(v))} stroke="var(--muted)" fontSize={12} />
          <YAxis tickFormatter={fmtAxis} stroke="var(--muted)" fontSize={12} width={52} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
            labelFormatter={(v) => `Subjacent: ${price(Number(v))}`}
            formatter={(v, name) => [money(Number(v), { plus: true }), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <ReferenceLine x={spot} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: 'Ara', fill: 'var(--muted)', fontSize: 11, position: 'insideTopRight' }} />
          {a.breakevens.map((b) => (
            <ReferenceLine key={b} x={b} stroke="var(--warn)" strokeDasharray="2 4" />
          ))}
          <Line type="linear" dataKey="expiry" name={`Al venciment (${shortDate(a.horizon)})`} stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="mid" name={`A mig camí (${shortDate(a.midDate)})`} stroke="var(--series2)" strokeWidth={1.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="today" name="Avui" stroke="var(--series3)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
