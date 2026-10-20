import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { cameraOutline, cameraReverseOutline, closeOutline, refreshOutline } from 'ionicons/icons';
import './CameraCapture.css';

/** A Philippine ID card is 85.6 x 54 mm, the ISO ID-1 size. */
const ID_CARD_RATIO = 85.6 / 54;
/** Share of the video width the card guide takes. Matches the CSS below. */
const GUIDE_WIDTH = 0.82;
/** Extra room kept around the guide when cropping, so a card held slightly off still fits. */
const CROP_MARGIN = 0.06;

/** The card guide plus its margin, in the video's own pixels. Capture and auto capture share it. */
const cropRect = (video: HTMLVideoElement) => {
  const width = Math.min(video.videoWidth, video.videoWidth * (GUIDE_WIDTH + CROP_MARGIN * 2));
  const height = Math.min(video.videoHeight, width / ID_CARD_RATIO);
  return { x: (video.videoWidth - width) / 2, y: (video.videoHeight - height) / 2, width, height };
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** The captured photo as a JPEG file: cropped to the card guide for an ID, the whole frame for an item. */
  onCapture: (file: File) => void;
  title?: string;
  /** What is being photographed. An ID gets the card guide and crop; an item or a receipt keeps the full frame. */
  subject?: 'id' | 'item' | 'receipt';
};

/** Wording that changes with what is being photographed. */
const COPY = {
  id: {
    eyebrow: 'VALID ID',
    alt: 'Captured ID',
    live: 'Place the ID inside the frame, flat and without glare, then press Capture.',
    review: 'Check that the name and ID number are sharp and readable.',
    shutter: 'Capture ID',
    file: 'id-photo',
  },
  item: {
    eyebrow: 'ITEM PHOTO',
    alt: 'Captured item',
    live: 'Fill the frame with the item on a plain surface, in good light, then press Capture.',
    review: 'Check that the item is sharp and its marks or details are visible.',
    shutter: 'Capture photo',
    file: 'item-photo',
  },
  receipt: {
    eyebrow: 'GCASH RECEIPT',
    alt: 'Captured receipt',
    live: 'Fit the whole receipt in the frame, flat and without glare, then press Capture.',
    review: 'Check that the reference number and amount are sharp and readable.',
    shutter: 'Capture receipt',
    file: 'gcash-receipt',
  },
} as const;

/**
 * Take a photo with the device camera: a customer's ID, for walk-ins who hand
 * the card over the counter, or a pawned item at intake.
 *
 * For an ID the live view shows a card-shaped guide and the saved photo is
 * cropped to it, which leaves less background for the OCR to misread. An item
 * keeps the whole frame. A photo is only kept after staff press Use photo, so a
 * blurry shot can be retaken on the spot.
 *
 * Staff take the photo with the shutter button under the live view.
 *
 * The browser only allows the camera on https or localhost. Where it is not
 * available, the modal says so and offers the device's own camera or file
 * picker instead.
 */
const CameraCapture: React.FC<Props> = ({ isOpen, onClose, onCapture, title = 'Take ID photo', subject = 'id' }) => {
  const copy = COPY[subject];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // The live stream, kept in state as well: IonModal mounts its content after
  // the camera may already have started, so the video is wired up whenever
  // either one arrives.
  const [stream, setStream] = useState<MediaStream | null>(null);
  // True once the video has real frames, which is when Capture can work.
  const [ready, setReady] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [canSwitch, setCanSwitch] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setStream(null);
    setReady(false);
  }, []);

  /** Callback ref: attach the stream as soon as the video element exists. */
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (element && streamRef.current && element.srcObject !== streamRef.current) {
      element.srcObject = streamRef.current;
      void element.play().catch(() => undefined);
    }
  }, []);

  // The stream can arrive after the video mounted; attach it then too.
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !stream || element.srcObject === stream) return;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
  }, [stream]);

  // Start the camera while the modal is open and no shot is on review.
  useEffect(() => {
    if (!isOpen || shot) return undefined;
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera here. The camera needs the app opened over https or on this computer (localhost).');
      return undefined;
    }

    setStarting(true);
    setError('');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        setStream(stream);
        return navigator.mediaDevices.enumerateDevices().then(devices => {
          if (!cancelled) setCanSwitch(devices.filter(device => device.kind === 'videoinput').length > 1);
        });
      })
      .catch((cameraError: unknown) => {
        if (cancelled) return;
        const name = cameraError instanceof DOMException ? cameraError.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site in the browser settings, then try again.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera was found on this device.'
              : 'The camera could not be started. It may be in use by another app.'
        );
      })
      .finally(() => { if (!cancelled) setStarting(false); });

    return () => { cancelled = true; stop(); };
  }, [isOpen, shot, facing, stop]);

  // Forget the last shot whenever the modal closes.
  useEffect(() => {
    if (isOpen) return;
    stop();
    setShot(current => { if (current) URL.revokeObjectURL(current.url); return null; });
    setError('');
  }, [isOpen, stop]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    // Capture stays disabled until frames arrive, so this only guards a race.
    if (!video || !video.videoWidth) return;

    const rect = subject === 'id'
      ? cropRect(video)
      : { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) return;
      stop();
      setShot({ url: URL.createObjectURL(blob), blob });
    }, 'image/jpeg', 0.92);
  }, [stop, subject]);

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  };

  const usePhoto = () => {
    if (!shot) return;
    onCapture(new File([shot.blob], `${copy.file}-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    onClose();
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="camera-capture-modal">
      <div className="camera-capture">
        <div className="camera-capture-head">
          <div>
            <small>{copy.eyebrow}</small>
            <h3>{title}</h3>
          </div>
          <button type="button" className="camera-capture-close" onClick={onClose} aria-label="Close camera"><IonIcon icon={closeOutline} /></button>
        </div>

        <div className="camera-capture-stage">
          {shot ? (
            <img src={shot.url} alt={copy.alt} className="camera-capture-shot" />
          ) : (
            <>
              {/* The frame hugs the video, so the guide lines up with what the
                  capture crops even when the video is scaled down to fit. */}
              <div className="camera-capture-frame">
                <video
                  ref={attachVideo}
                  autoPlay
                  playsInline
                  muted
                  className={facing === 'user' ? 'mirrored' : ''}
                  onLoadedData={() => setReady(true)}
                />
                {!error && subject === 'id' && (
                  <div className="camera-capture-guide" aria-hidden="true"><span /></div>
                )}
              </div>
              {(starting || !ready) && !error && <p className="camera-capture-status">Starting camera...</p>}
              {error && (
                <div className="camera-capture-error" role="alert">
                  <p>{error}</p>
                  <button type="button" onClick={() => fallbackRef.current?.click()}>Use device camera or file</button>
                </div>
              )}
            </>
          )}
        </div>

        <p className="camera-capture-hint">
          {shot ? copy.review : copy.live}
        </p>

        <div className={`camera-capture-actions${shot ? '' : ' live'}`}>
          {shot ? (
            <>
              <button type="button" className="secondary-button" onClick={retake}><IonIcon icon={refreshOutline} />Retake</button>
              <button type="button" className="primary-button" onClick={usePhoto}>Use photo</button>
            </>
          ) : (
            <>
              {canSwitch && (
                <button type="button" className="secondary-button" onClick={() => setFacing(current => (current === 'environment' ? 'user' : 'environment'))}>
                  <IonIcon icon={cameraReverseOutline} />Switch camera
                </button>
              )}
              <button type="button" className="camera-capture-shutter" onClick={capture} disabled={!ready || Boolean(error)}>
                <IonIcon icon={cameraOutline} />{copy.shutter}
              </button>
            </>
          )}
        </div>

        {/* Fallback when the live camera is unavailable: phones open their own camera app. */}
        <input
          ref={fallbackRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) { onCapture(file); onClose(); }
          }}
        />
      </div>
    </IonModal>
  );
};

export default CameraCapture;
