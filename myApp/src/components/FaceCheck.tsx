import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import {
    alertCircleOutline,
    cameraOutline,
    cameraReverseOutline,
    checkmarkCircleOutline,
    closeCircleOutline,
    closeOutline,
    helpCircleOutline,
    refreshOutline,
} from 'ionicons/icons';
import {
    getCustomerFace,
    recordFaceCheck,
    saveCustomerFace,
    type ApiCustomer,
    type FaceCheckResult,
} from '../services/api';
// The face library is large (TensorFlow.js), so it loads only when a check opens.
const faceMatch = () => import('../services/faceMatch');
import './FaceCheck.css';

/**
 * enroll: at registration, photograph the customer, compare them with their
 * valid ID, and keep the photo as their face reference.
 * verify: at redemption, photograph the person claiming the item and compare
 * them with that reference (or with the ID photo when there is none).
 */
export type FaceCheckMode = 'enroll' | 'verify';

type Props = {
    isOpen: boolean;
    mode: FaceCheckMode;
    customerId: number;
    customerName: string;
    /** Redemption only: the pawn the check is logged against. */
    transactionId?: number;
    onClose: () => void;
    /** The outcome, once staff finish. `customer` is set when a face reference was saved. */
    onDone: (result: FaceCheckResult, customer?: ApiCustomer) => void;
};

type Step = 'loading' | 'camera' | 'reading' | 'result';
type Reference = { photo: string; descriptor: number[]; source: 'face' | 'id' } | null;

/** How often the live view looks for a face, in ms. */
const SCAN_EVERY_MS = 700;

const VERDICT_COPY: Record<FaceCheckResult, { tone: string; icon: string; title: string; body: string }> = {
    match: { tone: 'match', icon: checkmarkCircleOutline, title: 'Looks like the same person', body: 'The face matches the photo on file.' },
    unsure: { tone: 'unsure', icon: helpCircleOutline, title: 'Not sure', body: 'Compare the face with the photo and the valid ID yourself before you continue.' },
    no_match: { tone: 'no-match', icon: closeCircleOutline, title: 'Does not look like the same person', body: 'Ask for a valid ID and check it carefully. Release nothing until you are sure.' },
    no_reference: { tone: 'none', icon: alertCircleOutline, title: 'No photo on file to compare', body: 'Check the valid ID by hand. You can save this photo so next time there is one.' },
    skipped: { tone: 'none', icon: alertCircleOutline, title: 'Face check skipped', body: '' },
};

/**
 * The face check dialog: a live camera with an oval guide, a hint that says
 * whether a face is in view, then the two photos side by side with a plain
 * verdict. Staff always make the call; the verdict only helps them.
 *
 * Matching runs on this device (services/faceMatch.ts). Photos leave it only
 * when staff save a face reference, and only with the customer's consent.
 */
const FaceCheck: React.FC<Props> = ({ isOpen, mode, customerId, customerName, transactionId, onClose, onDone }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [facing, setFacing] = useState<'user' | 'environment'>('user');
    const [step, setStep] = useState<Step>('loading');
    const [error, setError] = useState('');
    const [reference, setReference] = useState<Reference>(null);
    const [facesInView, setFacesInView] = useState(0);
    const [shot, setShot] = useState<{ photo: string; descriptor: number[] } | null>(null);
    const [result, setResult] = useState<{ verdict: FaceCheckResult; distance: number | null } | null>(null);
    const [consent, setConsent] = useState(false);
    const [saving, setSaving] = useState(false);

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setStream(null);
    }, []);

    const attachVideo = useCallback((element: HTMLVideoElement | null) => {
        videoRef.current = element;
        if (element && streamRef.current && element.srcObject !== streamRef.current) {
            element.srcObject = streamRef.current;
            void element.play().catch(() => undefined);
        }
    }, []);

    useEffect(() => {
        const element = videoRef.current;
        if (!element || !stream || element.srcObject === stream) return;
        element.srcObject = stream;
        void element.play().catch(() => undefined);
    }, [stream]);

    // Reset and get ready each time the dialog opens: the models, and the
    // photo the new one is compared with.
    useEffect(() => {
        if (!isOpen) return undefined;
        let cancelled = false;
        setStep('loading');
        setError('');
        setShot(null);
        setResult(null);
        setConsent(false);
        setReference(null);

        (async () => {
            try {
                const { loadFaceModels, loadImage, readFace } = await faceMatch();
                const [face] = await Promise.all([getCustomerFace(customerId), loadFaceModels()]);
                let next: Reference = null;
                // At redemption the enrolled face is the reference. At
                // registration, and when no face is enrolled yet, the ID photo is.
                if (mode === 'verify' && face.face_photo && face.face_descriptor?.length === 128) {
                    next = { photo: face.face_photo, descriptor: face.face_descriptor, source: 'face' };
                } else if (face.valid_id_photo) {
                    const reading = await readFace(await loadImage(face.valid_id_photo), true);
                    if (reading.kind === 'one') next = { photo: face.valid_id_photo, descriptor: Array.from(reading.descriptor), source: 'id' };
                }
                if (!cancelled) { setReference(next); setStep('camera'); }
            } catch (cause) {
                if (!cancelled) setError(cause instanceof Error ? cause.message : 'The face check could not start.');
            }
        })();

        return () => { cancelled = true; };
    }, [isOpen, customerId, mode]);

    // Camera on while the live view shows.
    useEffect(() => {
        if (!isOpen || step !== 'camera') return undefined;
        let cancelled = false;

        if (!navigator.mediaDevices?.getUserMedia) {
            setError('This browser cannot open the camera here. Open the app over https or on this computer (localhost).');
            return undefined;
        }

        navigator.mediaDevices
            .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
            .then(live => {
                if (cancelled) { live.getTracks().forEach(track => track.stop()); return; }
                streamRef.current = live;
                setStream(live);
                if (videoRef.current) attachVideo(videoRef.current);
            })
            .catch(() => setError('The camera could not be opened. Allow camera access for this site, then try again.'));

        return () => { cancelled = true; stopCamera(); };
    }, [isOpen, step, facing, attachVideo, stopCamera]);

    // Look for a face in the live view, so the hint can guide the customer.
    useEffect(() => {
        if (step !== 'camera' || !stream) return undefined;
        let busy = false;
        const timer = window.setInterval(async () => {
            const video = videoRef.current;
            if (busy || !video || video.readyState < 2) return;
            busy = true;
            try { const { countFaces } = await faceMatch(); setFacesInView(await countFaces(video)); } catch { /* the next tick tries again */ } finally { busy = false; }
        }, SCAN_EVERY_MS);
        return () => window.clearInterval(timer);
    }, [step, stream]);

    useEffect(() => () => stopCamera(), [stopCamera]);

    const takePhoto = async () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        setStep('reading');
        setError('');

        try {
            const { readFace, faceDistance, verdictFor } = await faceMatch();
            const reading = await readFace(canvas);
            if (reading.kind !== 'one') {
                setError(reading.kind === 'none' ? 'No face found in that photo. Ask the customer to face the camera, then try again.' : 'More than one face in that photo. Only the customer should be in the frame.');
                setStep('camera');
                return;
            }

            const photo = canvas.toDataURL('image/jpeg', 0.85);
            const descriptor = Array.from(reading.descriptor);
            stopCamera();
            setShot({ photo, descriptor });

            if (reference) {
                const distance = faceDistance(descriptor, reference.descriptor);
                setResult({ verdict: verdictFor(distance), distance });
            } else {
                setResult({ verdict: 'no_reference', distance: null });
            }
            setStep('result');
        } catch {
            setError('That photo could not be read. Try again.');
            setStep('camera');
        }
    };

    const retake = () => {
        setShot(null);
        setResult(null);
        setError('');
        setStep('camera');
    };

    const close = () => { stopCamera(); onClose(); };

    /** Keep the new photo as the customer's face reference (needs consent). */
    const saveReference = async () => {
        if (!shot || !result || !consent) return;
        setSaving(true);
        setError('');
        try {
            // At registration the ID comparison is worth keeping; at redemption it is the claim check.
            const idMatch = reference?.source === 'id' ? result.verdict : null;
            const customer = await saveCustomerFace(customerId, shot.photo, shot.descriptor, idMatch);
            if (mode === 'verify' && transactionId) await recordFaceCheck(transactionId, result.verdict, result.distance).catch(() => undefined);
            stopCamera();
            onDone(result.verdict, customer);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The face photo could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    /** Finish a redemption check without saving anything new. */
    const finishCheck = async () => {
        if (!result) return;
        setSaving(true);
        if (transactionId) await recordFaceCheck(transactionId, result.verdict, result.distance).catch(() => undefined);
        setSaving(false);
        stopCamera();
        onDone(result.verdict);
    };

    const verdict = result ? VERDICT_COPY[result.verdict] : null;
    const hint = facesInView === 1
        ? { tone: 'ok', text: 'Face found. Press Take photo.' }
        : facesInView > 1
            ? { tone: 'warn', text: 'Only the customer should be in the frame.' }
            : { tone: 'wait', text: 'Ask the customer to look straight at the camera.' };
    const canSave = mode === 'enroll' || result?.verdict === 'no_reference';

    return (
        <IonModal isOpen={isOpen} onDidDismiss={close} className="face-check-modal">
            <div className="face-check">
                <header className="face-check-head">
                    <div>
                        <small>{mode === 'enroll' ? 'FACE PHOTO' : 'CLAIMANT CHECK'}</small>
                        <h3>{mode === 'enroll' ? `Face photo for ${customerName}` : `Is this ${customerName}?`}</h3>
                    </div>
                    <button type="button" className="face-check-close" onClick={close} aria-label="Close face check">
                        <IonIcon icon={closeOutline} />
                    </button>
                </header>

                {step === 'loading' && !error && (
                    <div className="face-check-wait" role="status">
                        <span className="face-check-spinner" aria-hidden="true" />
                        <p>Getting the face check ready...</p>
                        <small>The first time can take a few seconds.</small>
                    </div>
                )}

                {(step === 'camera' || step === 'reading') && (
                    <>
                        <div className="face-check-stage">
                            <video ref={attachVideo} playsInline muted className={facing === 'user' ? 'mirrored' : ''} />
                            <div className={`face-check-oval is-${hint.tone}`} aria-hidden="true" />
                            {step === 'reading' && <div className="face-check-reading" role="status"><span className="face-check-spinner" />Checking the face...</div>}
                        </div>
                        <p className={`face-check-hint is-${hint.tone}`} role="status" aria-live="polite">{hint.text}</p>
                        <div className="face-check-actions">
                            <button type="button" className="face-check-secondary" onClick={() => setFacing(current => (current === 'user' ? 'environment' : 'user'))} disabled={step === 'reading'}>
                                <IonIcon icon={cameraReverseOutline} aria-hidden="true" />Switch camera
                            </button>
                            <button type="button" className="face-check-primary" onClick={takePhoto} disabled={step === 'reading' || !stream}>
                                <IonIcon icon={cameraOutline} aria-hidden="true" />Take photo
                            </button>
                        </div>
                    </>
                )}

                {step === 'result' && shot && verdict && (
                    <>
                        <div className="face-check-compare">
                            <figure>
                                {reference
                                    ? <img src={reference.photo} alt={reference.source === 'face' ? 'Face photo on file' : 'Valid ID photo'} />
                                    : <div className="face-check-empty">No photo</div>}
                                <figcaption>{reference?.source === 'face' ? 'Photo on file' : 'Valid ID'}</figcaption>
                            </figure>
                            <figure>
                                <img src={shot.photo} alt="Photo just taken" />
                                <figcaption>Now</figcaption>
                            </figure>
                        </div>

                        <div className={`face-check-verdict is-${verdict.tone}`} role="status">
                            <IonIcon icon={verdict.icon} aria-hidden="true" />
                            <div>
                                <strong>{mode === 'enroll' && result?.verdict === 'no_reference' ? 'No ID photo to compare' : verdict.title}</strong>
                                <p>{mode === 'enroll' && result?.verdict === 'no_reference'
                                    ? 'Check the valid ID by hand. The photo can still be saved for redemption checks.'
                                    : verdict.body}</p>
                            </div>
                        </div>

                        {canSave && (
                            <label className="face-check-consent">
                                <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
                                <span>The customer agrees that the shop keeps this photo to confirm who they are when they claim an item (Data Privacy Act of 2012).</span>
                            </label>
                        )}

                        <div className="face-check-actions">
                            <button type="button" className="face-check-secondary" onClick={retake} disabled={saving}>
                                <IonIcon icon={refreshOutline} aria-hidden="true" />Retake
                            </button>
                            {canSave
                                ? <button type="button" className="face-check-primary" onClick={saveReference} disabled={!consent || saving}>
                                    {saving ? 'Saving...' : 'Save face photo'}
                                </button>
                                : <button type="button" className="face-check-primary" onClick={finishCheck} disabled={saving}>
                                    {saving ? 'Saving...' : 'Done'}
                                </button>}
                        </div>
                        {mode === 'verify' && result?.verdict === 'no_reference' && (
                            <button type="button" className="face-check-link" onClick={finishCheck} disabled={saving}>Continue without saving</button>
                        )}
                    </>
                )}

                {error && <p className="face-check-error" role="alert">{error}</p>}
            </div>
        </IonModal>
    );
};

export default FaceCheck;
