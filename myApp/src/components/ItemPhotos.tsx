import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline, closeOutline } from 'ionicons/icons';
import './ItemPhotos.css';

/**
 * A small square of the item's first photo, or its initial when there is no
 * photo or the photo fails to load. With onOpen set it is a button that opens
 * the photo; the click does not reach the row or card around it.
 */
export const ItemThumb: React.FC<{
  photos: string[];
  name: string;
  className?: string;
  onOpen?: () => void;
}> = ({ photos, name, className = '', onOpen }) => {
  const [failed, setFailed] = useState(false);
  const src = photos[0];
  useEffect(() => setFailed(false), [src]);

  const initial = <i aria-hidden="true">{(name || '?')[0]}</i>;
  if (!src || failed) return <span className={`item-thumb is-initial ${className}`}>{initial}</span>;

  const image = <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  if (!onOpen) return <span className={`item-thumb ${className}`}>{image}</span>;

  return (
    <button
      type="button"
      className={`item-thumb is-button ${className}`}
      aria-label={`View photo of ${name}`}
      onClick={event => { event.stopPropagation(); onOpen(); }}
    >
      {image}
      {photos.length > 1 && <b className="item-thumb-count">{photos.length}</b>}
    </button>
  );
};

/**
 * Full-size photo viewer. Closes on the backdrop, the X, or Escape; arrows and
 * the arrow keys move between photos when there are several.
 *
 * The portal shell blurs its backdrop, which makes it the containing block for
 * fixed elements, so the viewer mounts on the .portal-page element, as the item
 * detail modal does.
 */
export const PhotoLightbox: React.FC<{
  photos: string[];
  startIndex?: number;
  name: string;
  onClose: () => void;
}> = ({ photos, startIndex = 0, name, onClose }) => {
  const [index, setIndex] = useState(startIndex);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const count = photos.length;

  useEffect(() => {
    setHost(anchorRef.current?.closest<HTMLElement>('.portal-page') ?? document.body);
  }, []);

  useEffect(() => {
    if (!host) return;
    closeRef.current?.focus();
    // Captured on window and stopped, so Escape closes only the photo and not
    // the item detail modal the photo was opened from.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      else if (event.key === 'ArrowRight') setIndex(current => (current + 1) % count);
      else if (event.key === 'ArrowLeft') setIndex(current => (current - 1 + count) % count);
      else return;
      event.stopPropagation();
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [host, count]);

  if (count === 0) return null;

  const viewer = (
    // React passes portal clicks up its own tree, so every click stops here and
    // never reaches the table row or card the photo was opened from.
    <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Photo of ${name}`} onClick={event => { event.stopPropagation(); onClose(); }}>
      <button ref={closeRef} type="button" className="photo-lightbox-close" onClick={event => { event.stopPropagation(); onClose(); }} aria-label="Close photo">
        <IonIcon icon={closeOutline} />
      </button>
      <figure className="photo-lightbox-figure" onClick={event => event.stopPropagation()}>
        <img src={photos[index]} alt={`${name}, photo ${index + 1} of ${count}`} />
        {count > 1 && <figcaption>{index + 1} / {count}</figcaption>}
      </figure>
      {count > 1 && (
        <>
          <button
            type="button"
            className="photo-lightbox-nav is-prev"
            aria-label="Previous photo"
            onClick={event => { event.stopPropagation(); setIndex((index - 1 + count) % count); }}
          >
            <IonIcon icon={chevronBackOutline} />
          </button>
          <button
            type="button"
            className="photo-lightbox-nav is-next"
            aria-label="Next photo"
            onClick={event => { event.stopPropagation(); setIndex((index + 1) % count); }}
          >
            <IonIcon icon={chevronForwardOutline} />
          </button>
        </>
      )}
    </div>
  );

  return <>
    <span ref={anchorRef} hidden />
    {host && createPortal(viewer, host)}
  </>;
};

/**
 * The item's photos inside the detail modal: one large photo, or a strip that
 * scrolls sideways when there are several. Renders nothing without photos.
 */
export const PhotoStrip: React.FC<{ photos: string[]; name: string; onOpen: (index: number) => void }> = ({ photos, name, onOpen }) => {
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const shown = photos.map((src, index) => ({ src, index })).filter(photo => !broken[photo.index]);
  if (shown.length === 0) return null;

  return (
    <div className={`photo-strip ${shown.length > 1 ? 'is-multiple' : 'is-single'}`} role="list" aria-label={`Photos of ${name}`}>
      {shown.map(photo => (
        <button
          type="button"
          role="listitem"
          className="photo-strip-item"
          key={photo.index}
          onClick={() => onOpen(photo.index)}
          aria-label={`View photo ${photo.index + 1} of ${photos.length}`}
        >
          <img src={photo.src} alt="" loading="lazy" onError={() => setBroken(current => ({ ...current, [photo.index]: true }))} />
        </button>
      ))}
    </div>
  );
};

/** A thumbnail that opens its own full-size viewer, for rows and cards. */
export const ItemThumbViewer: React.FC<{ photos: string[]; name: string; className?: string }> = ({ photos, name, className }) => {
  const [open, setOpen] = useState(false);
  return <>
    <ItemThumb photos={photos} name={name} className={className} onOpen={() => setOpen(true)} />
    {open && <PhotoLightbox photos={photos} name={name} onClose={() => setOpen(false)} />}
  </>;
};
