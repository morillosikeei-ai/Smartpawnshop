import React, { useLayoutEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { moonOutline, sunnyOutline } from 'ionicons/icons';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'smartpawn_theme';

function readStoredMode(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Light or dark mode for the portal that renders it.
 *
 * The choice is kept per browser and applied as data-theme on <html>, which
 * theme/portal-dark.css keys off. The attribute is removed when the portal
 * unmounts, so the landing and sign-in pages always stay light.
 */
export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (mode === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* private mode: keep it for this visit only */ }
    return () => root.removeAttribute('data-theme');
  }, [mode]);

  return { mode, toggle: () => setMode(current => (current === 'dark' ? 'light' : 'dark')) };
}

/**
 * Sun/moon button for a portal top bar. Pass the class of that portal's
 * notification bell so both buttons look the same.
 */
const ThemeToggle: React.FC<{ className: string }> = ({ className }) => {
  const { mode, toggle } = useThemeMode();
  const dark = mode === 'dark';

  return (
    <button
      type="button"
      className={`${className} theme-toggle`}
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      <IonIcon icon={dark ? sunnyOutline : moonOutline} />
    </button>
  );
};

export default ThemeToggle;
