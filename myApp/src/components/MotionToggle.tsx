import React, { useLayoutEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { pauseOutline, playOutline } from 'ionicons/icons';

const STORAGE_KEY = 'smartpawn_bg_motion';

function readStoredMotion(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Whether the rain pattern backgrounds move.
 *
 * Off by default, because a moving full-page background makes slower machines
 * lag. The choice is kept per browser and applied as data-motion="on" on
 * <html>, which the rain stylesheets key their animation off. Unlike the theme
 * it is left in place on unmount, so the landing page and the portals share it.
 */
export function useBackgroundMotion() {
  const [on, setOn] = useState<boolean>(readStoredMotion);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (on) root.setAttribute('data-motion', 'on');
    else root.removeAttribute('data-motion');
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* private mode: keep it for this visit only */ }
  }, [on]);

  return { on, toggle: () => setOn(current => !current) };
}

/**
 * Play/pause button for the background animation. Pass the class of the
 * button it sits beside (the theme toggle or the bell) so they look the same.
 */
const MotionToggle: React.FC<{ className: string }> = ({ className }) => {
  const { on, toggle } = useBackgroundMotion();

  return (
    <button
      type="button"
      className={`${className} motion-toggle`}
      onClick={toggle}
      aria-label={on ? 'Stop background animation' : 'Animate background'}
      aria-pressed={on}
      title={on ? 'Stop background animation' : 'Animate background'}
    >
      <IonIcon icon={on ? pauseOutline : playOutline} />
    </button>
  );
};

export default MotionToggle;
