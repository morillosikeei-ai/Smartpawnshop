/**
 * Shared geometry for the dashboard's smooth area charts.
 *
 * Both the revenue and the gold price cards draw one curved series over an
 * evenly spaced x axis, so the interpolation lives here rather than being
 * written twice.
 */

export type ChartPoint = { x: number; y: number };

/**
 * Slope at each point for a monotone cubic interpolation.
 *
 * A plain smoothing spline can overshoot between two points, which on a money
 * chart would draw a curve running past values that never occurred. Monotone
 * tangents cannot overshoot: the curve only changes direction where the data
 * does.
 */
export const monotoneTangents = (values: number[], step: number): number[] => {
  const count = values.length;
  const secants: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    secants.push((values[index + 1] - values[index]) / step);
  }

  const tangents = [secants[0]];
  for (let index = 1; index < count - 1; index += 1) {
    const previous = secants[index - 1];
    const next = secants[index];

    // A sign change means this point is a peak or a trough, so the curve has
    // to flatten there rather than run past it.
    if (previous * next <= 0) {
      tangents.push(0);
      continue;
    }

    // Fritsch-Carlson: take the average slope, then cap it at three times the
    // smaller neighbouring slope. That cap is what keeps the curve monotone.
    const average = (previous + next) / 2;
    const limit = 3 * Math.min(Math.abs(previous), Math.abs(next));
    tangents.push(Math.sign(average) * Math.min(Math.abs(average), limit));
  }
  tangents.push(secants[count - 2]);

  return tangents;
};

/** Cubic bezier path through the points, smoothed with monotone tangents. */
export const buildLinePath = (coordinates: ChartPoint[]): string => {
  if (coordinates.length < 2) return '';

  const step = coordinates[1].x - coordinates[0].x;
  const tangents = monotoneTangents(coordinates.map((point) => point.y), step);
  const third = step / 3;

  let path = `M ${coordinates[0].x} ${coordinates[0].y}`;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const from = coordinates[index];
    const to = coordinates[index + 1];
    path +=
      ` C ${from.x + third} ${from.y + tangents[index] * third},` +
      ` ${to.x - third} ${to.y - tangents[index + 1] * third},` +
      ` ${to.x} ${to.y}`;
  }

  return path;
};

/** Closes a line path down to the baseline so the area under it can be filled. */
export const buildAreaPath = (coordinates: ChartPoint[], linePath: string, baseline: number): string =>
  linePath
    ? `${linePath} L ${coordinates[coordinates.length - 1].x} ${baseline} L ${coordinates[0].x} ${baseline} Z`
    : '';
