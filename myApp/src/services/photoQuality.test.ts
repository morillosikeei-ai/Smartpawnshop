import { judge, scoreGrayscale, MIN_SHARPNESS } from './photoQuality';

const WIDTH = 256;
const HEIGHT = 256;

/** A well-lit frame with crisp detail, standing in for a usable item photo. */
function sharpFrame(): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const base = 120 + 50 * Math.sin(x / 40) * Math.cos(y / 33);
      const detail = ((x >> 2) + (y >> 2)) % 2 === 0 ? 38 : -38;
      gray[y * WIDTH + x] = Math.max(0, Math.min(255, base + detail));
    }
  }
  return gray;
}

/** Box blur, which is what a shaky hand does to the same frame. */
function blurredOnce(source: Uint8ClampedArray, radius: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= HEIGHT || nx < 0 || nx >= WIDTH) continue;
          sum += source[ny * WIDTH + nx];
          count++;
        }
      }
      out[y * WIDTH + x] = sum / count;
    }
  }
  return out;
}

/** Repeated blur, standing in for a photo taken while moving. */
function blurred(source: Uint8ClampedArray, radius: number, passes: number): Uint8ClampedArray {
  let current = source;
  for (let pass = 0; pass < passes; pass++) current = blurredOnce(current, radius);
  return current;
}

/** Push every pixel toward black or white, which is what bad exposure does. */
function exposed(source: Uint8ClampedArray, factor: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(WIDTH * HEIGHT);
  for (let i = 0; i < source.length; i++) out[i] = Math.max(0, Math.min(255, source[i] * factor));
  return out;
}

const score = (gray: Uint8ClampedArray) => {
  const { brightness, sharpness } = scoreGrayscale(gray, WIDTH, HEIGHT);
  return judge(brightness, sharpness);
};

test('a sharp, well-lit frame passes every check', () => {
  const result = score(sharpFrame());
  expect(result.ok).toBe(true);
  expect(result.warning).toBe('');
  expect(result.sharpness).toBeGreaterThan(MIN_SHARPNESS);
});

test('a blurred frame is reported as blurry', () => {
  const result = score(blurred(sharpFrame(), 2, 2));
  expect(result.blurry).toBe(true);
  expect(result.ok).toBe(false);
  expect(result.warning).toContain('blurry or too dark');
});

test('sharpness falls as the frame is blurred further', () => {
  const frame = sharpFrame();
  expect(scoreGrayscale(frame, WIDTH, HEIGHT).sharpness)
    .toBeGreaterThan(scoreGrayscale(blurred(frame, 1, 1), WIDTH, HEIGHT).sharpness);
  expect(scoreGrayscale(blurred(frame, 1, 1), WIDTH, HEIGHT).sharpness)
    .toBeGreaterThan(scoreGrayscale(blurred(frame, 2, 2), WIDTH, HEIGHT).sharpness);
});

test('an underexposed frame is reported as too dark', () => {
  const result = score(exposed(sharpFrame(), 0.15));
  expect(result.tooDark).toBe(true);
  expect(result.ok).toBe(false);
});

test('an overexposed frame is reported as too bright', () => {
  const result = score(exposed(sharpFrame(), 3));
  expect(result.tooBright).toBe(true);
  expect(result.warning).toContain('overexposed');
});
