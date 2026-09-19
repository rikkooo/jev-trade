import type { ChartPoint } from "@/modules/view-model";
import { formatCurrency, formatInteger } from "@/modules/view-model";

function geometry(points: readonly ChartPoint[]) {
  const width = 720;
  const height = 250;
  const inset = 18;
  const lows = points.map((point) => point.close);
  const min = Math.min(...lows);
  const max = Math.max(...lows);
  const spread = max - min || 1;
  const path = points
    .map((point, index) => {
      const x =
        inset + (index / Math.max(1, points.length - 1)) * (width - inset * 2);
      const y =
        height - inset - ((point.close - min) / spread) * (height - inset * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${path} L${width - inset},${height - inset} L${inset},${height - inset} Z`;
  return { path, area, min, max, width, height };
}

export function PriceChart({
  points,
  symbol,
}: {
  readonly points: readonly ChartPoint[];
  readonly symbol: string;
}) {
  const { path, area, min, max, width, height } = geometry(points);
  return (
    <div className="chart-stack">
      <div className="chart-frame">
        <div className="chart-scale" aria-hidden="true">
          <span>{formatCurrency(max)}</span>
          <span>{formatCurrency((min + max) / 2)}</span>
          <span>{formatCurrency(min)}</span>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={`${symbol}-chart-title ${symbol}-chart-desc`}
          preserveAspectRatio="none"
        >
          <title id={`${symbol}-chart-title`}>
            {`${symbol} synthetic adjusted closes`}
          </title>
          <desc id={`${symbol}-chart-desc`}>
            A 23-session synthetic fixture line chart. The equivalent table
            follows.
          </desc>
          <defs>
            <linearGradient id={`${symbol}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--cyan)" stopOpacity=".28" />
              <stop offset="1" stopColor="var(--cyan)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="chart-grid" aria-hidden="true">
            <line x1="18" x2="702" y1="18" y2="18" />
            <line x1="18" x2="702" y1="125" y2="125" />
            <line x1="18" x2="702" y1="232" y2="232" />
          </g>
          <path d={area} fill={`url(#${symbol}-area)`} />
          <path className="price-line" d={path} />
        </svg>
      </div>
      <details className="data-table-disclosure">
        <summary>View accessible session data</summary>
        <div className="table-scroll">
          <table>
            <caption>{symbol} synthetic adjusted closes and volume</caption>
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Adjusted close</th>
                <th scope="col">Volume</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.session}>
                  <th scope="row">{point.session}</th>
                  <td>{formatCurrency(point.close)}</td>
                  <td>{formatInteger(point.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
