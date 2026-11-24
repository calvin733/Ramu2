import { formatNumber, millions, type ChartPoint } from "@/domain/sales";

export function SalesChart({
  points,
  kind = "dashboard",
}: {
  points: ChartPoint[];
  kind?: "dashboard" | "preview";
}) {
  if (!points.length) return null;
  const peak = points.reduce(
    (best, point, index) => (point.value > points[best].value ? index : best),
    0,
  );
  const max = Math.max(
    0,
    ...points.map((point) => Math.max(point.value, point.previous ?? 0)),
  );
  const min = Math.min(
    0,
    ...points.map((point) => Math.min(point.value, point.previous ?? 0)),
  );
  const x = (index: number) =>
    points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
  const y = (value: number) =>
    100 - ((value - min) / (max - min || 1)) * (kind === "dashboard" ? 68 : 84);
  const tick = min + (max - min) * 0.75;
  const tickValue =
    Math.abs(tick) >= 1_000_000 ? Math.round(tick / 100_000) * 100_000 : tick;
  const axisLabel = (value: number) =>
    Math.abs(value) < 1_000_000 ? formatNumber(value) : millions(value);
  const currentLine = points
    .map((point, index) => `${x(index)},${y(point.value)}`)
    .join(" ");
  const previousLine = points
    .flatMap((point, index) =>
      point.previous === null ? [] : [`${x(index)},${y(point.previous)}`],
    )
    .join(" ");
  const tickIndexes = new Set(
    Array.from({ length: Math.min(5, points.length) }, (_, index) =>
      Math.round(
        (index * (points.length - 1)) / (Math.min(5, points.length) - 1 || 1),
      ),
    ),
  );

  return (
    <div
      className={kind === "preview" ? "preview-plot" : "chart"}
      aria-hidden="true"
    >
      {kind === "dashboard" && (
        <div className="chart-y">
          <span>{max === min ? "" : axisLabel(tickValue)}</span>
          <span>{axisLabel(min)}</span>
        </div>
      )}
      <div className="chart-body">
        <div className="chart-plot">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            focusable="false"
          >
            {min < 0 && (
              <line
                className="chart-zero"
                x1="0"
                x2="100"
                y1={y(0)}
                y2={y(0)}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {previousLine && kind === "dashboard" && (
              <polyline
                className="chart-previous"
                points={previousLine}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <polyline
              className="chart-current"
              points={currentLine}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {kind === "dashboard" && (
            <span
              className="chart-dot"
              style={{ left: `${x(peak)}%`, top: `${y(points[peak].value)}%` }}
            />
          )}
        </div>
        {kind === "dashboard" && (
          <div className="chart-x">
            {points
              .filter((_, index) => tickIndexes.has(index))
              .map((point) => (
                <span key={point.label}>{point.label}</span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChartTable({ points }: { points: ChartPoint[] }) {
  const hasComparison = points.some((point) => point.previous !== null);
  return (
    <table className="data-table">
      <caption>Rincian penjualan berdasarkan periode terpilih (Rp)</caption>
      <thead>
        <tr>
          <th scope="col">Periode</th>
          <th scope="col">Penjualan</th>
          {hasComparison && <th scope="col">Pembanding</th>}
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.fullLabel}>
            <th scope="row">{point.fullLabel}</th>
            <td>{formatNumber(point.value)}</td>
            {hasComparison && (
              <td>
                {point.previous === null ? "—" : formatNumber(point.previous)}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
