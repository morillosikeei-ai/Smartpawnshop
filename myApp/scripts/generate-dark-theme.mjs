/**
 * Generates src/theme/portal-dark.css from the portal stylesheets.
 *
 * The portals were styled with literal light colours (white panels, near-black
 * ink, pale grey borders) spread over many files, often with !important. Rather
 * than hand-copy every rule, this script reads each rule and, for the neutral
 * light-theme colours only, writes a dark counterpart scoped to
 * html[data-theme="dark"]. Solid brand colours (gold, blue buttons) are left
 * alone; pale status badges become a dark wash of the same hue with lighter text.
 *
 * Run after changing portal CSS:  npm run theme:dark
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = 'src/theme/portal-dark.css';

// Stylesheets used by the Staff, Admin and Customer portals. Landing, sign in,
// set password and QR access pages never show the toggle and stay light.
const SOURCES = [
  'src/staff/*.css',
  'src/admin/*.css',
  'src/pages/CustomerPortal.css',
  'src/components/*.css',
  'src/theme/portal-ui.css',
  'src/theme/portal-type.css',
  'src/theme/portal-notifications-mobile.css',
];

// Selectors that are already dark in the light theme, or belong to pages
// outside the portals.
const SKIP_SELECTOR = /sidebar|side-brand|items-slide|faq-|branch-map|leaflet/i;
// Selectors for pages outside the portals. A rule shared with a portal, such as
// `.staff-page, .staff-login-page { --staff-ink: ... }`, keeps its portal part.
const OTHER_PAGE_SELECTOR = /staff-login|landing|auth-|set-password|qr-access/i;

const PREFIX = 'html[data-theme="dark"]';

// Dark palette.
const DARK = {
  page: '#0b1220',
  surface: '#131c2e',
  surface2: '#1a2539',
  raised: '#24324d',
  border: '#2a3650',
  text: '#e6ebf5',
  muted: '#a3afc2',
  link: '#8fb0ff',
};
// Light-theme ink, for text on fills that stay bright in dark mode.
const LIGHT_INK = '#061028';

// ---------- colour helpers ----------
const COLOR_RE = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/g;

function parseColor(token) {
  const t = token.toLowerCase();
  if (t === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (t === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (t.startsWith('#')) {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a };
  }
  const parts = t.replace(/rgba?\(|\)/g, '').split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

function luminance({ r, g, b }) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const chroma = ({ r, g, b }) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
const withAlpha = (hex, a) => {
  if (a >= 1) return hex;
  const c = parseColor(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${+a.toFixed(3)})`;
};

// ---------- mapping ----------
function mapBackground(value) {
  // Ink variables turn light in dark mode, so a fill that borrows one (an
  // active chip) would flip to a light block; give it the raised surface.
  if (/^var\(--[\w-]*ink\)$/.test(value.trim())) return DARK.raised;
  const tokens = value.match(COLOR_RE) || [];
  if (!tokens.length) return null;
  const colors = tokens.map(parseColor);
  if (colors.some(c => !c)) return null;
  // Every colour in the value must be a neutral light, e.g. white panels or a
  // white-to-grey gradient. Anything tinted is a deliberate accent.
  if (colors.every(c => chroma(c) <= 0.1 && luminance(c) > 0.75)) {
    let i = 0;
    return value.replace(COLOR_RE, () => {
      const c = colors[i++];
      return withAlpha(luminance(c) > 0.93 ? DARK.surface : DARK.surface2, c.a);
    });
  }
  // Pale tinted chips and badges (light blue, green, amber, red) become a
  // dark translucent wash of the same hue; their text is lightened below.
  if (tokens.length === 1 && value.trim() === tokens[0] && chroma(colors[0]) > 0.02 && chroma(colors[0]) <= 0.4 && luminance(colors[0]) > 0.7 && colors[0].a > 0.5) {
    const c = colors[0];
    return value.replace(tokens[0], `rgba(${c.r}, ${c.g}, ${c.b}, 0.16)`);
  }
  // Solid near-black buttons and chips would vanish on a dark surface.
  if (tokens.length === 1 && value.trim() === tokens[0] && chroma(colors[0]) <= 0.2 && luminance(colors[0]) < 0.02 && colors[0].a > 0.5) {
    return DARK.raised;
  }
  return null;
}

const lighten = (c, amount) => {
  const mix = v => Math.round(v + (255 - v) * amount);
  return withAlpha(`#${[mix(c.r), mix(c.g), mix(c.b)].map(v => v.toString(16).padStart(2, '0')).join('')}`, c.a);
};

function mapText(value) {
  if (/^var\(--[\w-]*blue\)$/.test(value.trim())) return DARK.link;
  const tokens = value.match(COLOR_RE) || [];
  if (tokens.length !== 1) return null;
  const c = parseColor(tokens[0]);
  if (!c) return null;
  const L = luminance(c);
  let next = null;
  if (chroma(c) <= 0.25) {
    if (L < 0.03) next = DARK.text;
    else if (L < 0.45) next = DARK.muted;
  } else if (L < 0.2 && c.b > c.r && c.b > c.g) {
    next = DARK.link; // dark blue links and actions
  } else if (L < 0.25) {
    return value.replace(tokens[0], lighten(c, 0.45)); // dark green, red, amber status text
  }
  return next ? value.replace(tokens[0], withAlpha(next, c.a)) : null;
}

function mapBorder(value) {
  const tokens = value.match(COLOR_RE) || [];
  if (!tokens.length) return null;
  let changed = false;
  const out = value.replace(COLOR_RE, token => {
    const c = parseColor(token);
    if (c && chroma(c) <= 0.15 && luminance(c) > 0.55) { changed = true; return withAlpha(DARK.border, c.a); }
    return token;
  });
  return changed ? out : null;
}

function mapCustomProperty(name, value) {
  const n = name.toLowerCase();
  const tokens = value.match(COLOR_RE) || [];
  if (tokens.length !== 1 || value.trim() !== tokens[0]) {
    return /background/.test(n) ? mapBackground(value) : null;
  }
  const c = parseColor(tokens[0]);
  if (!c) return null;
  if (/ink|text/.test(n)) return chroma(c) <= 0.25 && luminance(c) < 0.03 ? DARK.text : null;
  if (/muted/.test(n)) return chroma(c) <= 0.25 && luminance(c) < 0.45 ? DARK.muted : null;
  if (/line|border/.test(n)) return mapBorder(value);
  if (/page/.test(n)) return chroma(c) <= 0.1 && luminance(c) > 0.75 ? DARK.page : null;
  if (/soft|panel|background|surface|wash|tint/.test(n)) return mapBackground(value);
  // Accent tones (--trend-tone, --note-tone, --lower-action) colour text and
  // icons, so a dark tone needs the same lightening as plain text.
  if (/(^|-)(color|tone|action|link)$/.test(n)) return mapText(value);
  return null;
}

const BACKGROUND_PROPS = new Set(['background', 'background-color', '--background', '--ion-item-background', '--background-hover', '--background-focused']);
const TEXT_PROPS = new Set(['color', '--color', '--placeholder-color', 'caret-color']);
const BORDER_PROPS = /^(border(-top|-right|-bottom|-left)?(-color)?|outline(-color)?|--border-color|column-rule-color)$/;
const SVG_PROPS = new Set(['fill', 'stroke']);

// ---------- CSS parsing ----------
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

function splitTopLevel(text, sep) {
  const out = [];
  let depth = 0, quote = null, cur = '';
  for (const ch of text) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Yields { context: string[], selector, body } for every plain rule. */
function* rules(css, context = []) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) return;
    const prelude = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    i = j;
    if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
      if (/\bprint\b/.test(prelude)) continue;
      yield* rules(body, [...context, prelude]);
    } else if (prelude.startsWith('@')) {
      continue; // keyframes, font-face
    } else if (prelude) {
      yield { context, selector: prelude, body };
    }
  }
}

function prefixSelector(selector) {
  const all = splitTopLevel(selector, ',').map(s => s.trim()).filter(Boolean);
  if (all.some(p => SKIP_SELECTOR.test(p))) return null;
  const parts = all.filter(p => !OTHER_PAGE_SELECTOR.test(p));
  if (!parts.length) return null;
  return parts.map(p => {
    if (p.startsWith(':root')) return PREFIX + p.slice(5);
    if (/^html\b/.test(p)) return PREFIX + p.slice(4);
    return `${PREFIX} ${p}`;
  }).join(',\n');
}

// ---------- main ----------
const files = [...new Set(SOURCES.flatMap(pattern => globSync(pattern, { cwd: ROOT })))].map(f => f.replace(/\\/g, '/')).sort();
const blocks = new Map(); // context -> string[]
let ruleCount = 0;

for (const file of files) {
  const css = stripComments(readFileSync(path.join(ROOT, file), 'utf8'));
  for (const { context, selector, body } of rules(css)) {
    const decls = splitTopLevel(body, ';').map(d => d.trim()).filter(Boolean);
    const parsed = decls.map(d => {
      const k = d.indexOf(':');
      if (k < 0) return null;
      const prop = d.slice(0, k).trim().toLowerCase();
      const value = d.slice(k + 1).replace(/!important/i, '').trim();
      return { prop, value };
    }).filter(Boolean);

    // Text sitting on a tinted accent background keeps its colour; lightening
    // it would lose contrast against the tint.
    const hasAccentBackground = parsed.some(({ prop, value }) => BACKGROUND_PROPS.has(prop) && (value.match(COLOR_RE) || []).length && mapBackground(value) === null
      && (value.match(COLOR_RE) || []).some(t => { const c = parseColor(t); return c && c.a > 0.3; }));
    // Gold chips and buttons stay gold in dark mode, but an ink variable on
    // them turns light, so pin that text to the light-theme ink.
    const onGold = parsed.some(({ prop, value }) => BACKGROUND_PROPS.has(prop) && /^var\(--[\w-]*gold\b/.test(value.trim()))
      || (hasAccentBackground && parsed.some(({ prop, value }) => BACKGROUND_PROPS.has(prop) && (value.match(COLOR_RE) || []).some(t => { const c = parseColor(t); return c && luminance(c) > 0.35; })));
    const inkVar = value => /^var\(--[\w-]*ink\b/.test(value.trim());

    const out = [];
    for (const { prop, value } of parsed) {
      let next = null;
      if (prop.startsWith('--') && !BACKGROUND_PROPS.has(prop) && !TEXT_PROPS.has(prop) && prop !== '--border-color') next = mapCustomProperty(prop, value);
      else if (BACKGROUND_PROPS.has(prop)) next = mapBackground(value);
      else if (TEXT_PROPS.has(prop) && onGold && inkVar(value)) {
        // Override the variable, not the colour, so a later rule that repaints
        // the chip (a red count badge with white text) still wins.
        out.push(`  ${value.trim().match(/--[\w-]+/)[0]}: ${LIGHT_INK} !important;`);
        continue;
      }
      else if (TEXT_PROPS.has(prop)) next = hasAccentBackground ? null : mapText(value);
      else if (BORDER_PROPS.test(prop)) next = mapBorder(value);
      else if (SVG_PROPS.has(prop)) next = mapBorder(value) ?? (hasAccentBackground ? null : mapText(value));
      if (next && next !== value) out.push(`  ${prop}: ${next} !important;`);
    }
    if (!out.length) continue;
    const sel = prefixSelector(selector);
    if (!sel) continue;
    const key = context.join(' ');
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(`/* ${file} */\n${sel} {\n${out.join('\n')}\n}`);
    ruleCount++;
  }
}

const header = `/* ============================================================
   Dark theme for the Staff, Admin and Customer portals.

   GENERATED by scripts/generate-dark-theme.mjs. Do not edit by hand:
   change the script or the portal CSS, then run  npm run theme:dark

   Active when <html data-theme="dark">, set by the theme toggle
   next to the notification bell (src/components/ThemeToggle.tsx).
   ============================================================ */

${PREFIX} {
  color-scheme: dark;
  --ion-background-color: ${DARK.page};
  --ion-item-background: ${DARK.surface};
  --ion-text-color: ${DARK.text};
  --ion-color-step-50: ${DARK.surface2};
  --ion-color-step-150: ${DARK.border};
  --ion-color-step-600: ${DARK.muted};
}

${PREFIX} ion-content {
  --background: ${DARK.page} !important;
}

${PREFIX} input::placeholder,
${PREFIX} textarea::placeholder {
  color: ${DARK.muted} !important;
}
`;

let body = '';
for (const [context, list] of blocks) {
  if (!context) body += `\n${list.join('\n\n')}\n`;
}
for (const [context, list] of blocks) {
  if (context) {
    const opens = context.split(/ (?=@)/);
    body += `\n${opens.map(o => `${o} {`).join('\n')}\n${list.join('\n\n')}\n${opens.map(() => '}').join('\n')}\n`;
  }
}

// Page backgrounds come last so they win over the panel mapping above.
const tail = `
/* ---------- Page backgrounds ---------- */
${PREFIX} .staff-page ion-content,
${PREFIX} .admin-page ion-content,
${PREFIX} .portal-page ion-content {
  --background: ${DARK.page} !important;
}
${PREFIX} .staff-page,
${PREFIX} .admin-page,
${PREFIX} .portal-page {
  --pui-page: ${DARK.page} !important;
}
`;

writeFileSync(path.join(ROOT, OUT), header + body + tail);
console.log(`${OUT}: ${ruleCount} rules from ${files.length} files`);
