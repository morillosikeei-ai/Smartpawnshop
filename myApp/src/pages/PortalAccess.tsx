import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonPage,
    IonSpinner,
    IonToolbar,
} from '@ionic/react';
import {
    alertCircleOutline,
    checkmarkCircleOutline,
    closeOutline,
    lockClosedOutline,
    mailOutline,
} from 'ionicons/icons';
import { checkQrAccessCode, verifyQrAccess } from '../services/api';
import './SetPassword.css';
import '../theme/ridge-button.css';
import './PortalAccess.css';

/**
 * The page a pawn ticket QR code opens.
 *
 * The QR carries a random code and nothing else, so landing here proves only
 * that someone holds the ticket. The registered email address is what proves
 * whose ticket it is, and only the two together open the portal.
 *
 * This is a backup route in. The activation email and the Gmail password reset
 * are unchanged and remain the ordinary way to sign in.
 */
const PortalAccess: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const code = searchParams.get('code') || '';

    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(true);
    const [codeValid, setCodeValid] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const emailRef = useRef<HTMLIonInputElement>(null);

    const codeMissing = code.trim() === '';

    // The API is asked whether the scanned code is live before the form is
    // shown, so a ticket that was reprinted or retired says so at once instead
    // of after the customer has typed their address.
    useEffect(() => {
        if (codeMissing) {
            setChecking(false);
            return;
        }

        let active = true;

        checkQrAccessCode(code)
            .then(result => { if (active) setCodeValid(result.valid); })
            .catch(() => { if (active) setCodeValid(false); })
            .finally(() => { if (active) setChecking(false); });

        return () => { active = false; };
    }, [code, codeMissing]);

    useEffect(() => {
        if (codeValid && !success) emailRef.current?.setFocus();
    }, [codeValid, success]);

    const canSubmit = useMemo(
        () => email.trim().length > 0 && !submitting && codeValid,
        [email, submitting, codeValid],
    );

    const handleSubmit = async () => {
        setError('');

        if (!email.trim()) {
            setError('Enter the email address the shop registered for you.');
            return;
        }

        setSubmitting(true);
        try {
            await verifyQrAccess(code, email.trim());
            setSuccess(true);
            navigate('/customer/dashboard', { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not open your portal. Try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && canSubmit) handleSubmit();
    };

    return (
        <IonPage>
            <IonHeader className="set-password-header">
                <IonToolbar className="set-password-toolbar glass-nav">
                    <div className="set-password-toolbar-content">
                        <div className="brand-section">
                            <img src="/pagasa.png" alt="Pag-Asa Pawnshop logo" className="brand-mark-small" />
                            <span className="brand-text">PAG-ASA PAWNSHOP</span>
                        </div>
                        <IonButton
                            fill="clear"
                            onClick={() => navigate('/')}
                            className="close-btn"
                            aria-label="Close and return to login"
                        >
                            <IonIcon icon={closeOutline} />
                        </IonButton>
                    </div>
                </IonToolbar>
            </IonHeader>

            <IonContent className="set-password-content">
                <div className="set-password-container">
                    <IonCard className="set-password-card glass-modal">
                        <IonCardContent className="set-password-body">
                            <div className="auth-brand">
                                <img src="/pagasa.png" alt="Pag-Asa Pawnshop logo" />
                            </div>

                            <div className="qr-access-badge">
                                <IonIcon icon={lockClosedOutline} aria-hidden="true" />
                                <span>Secure verification</span>
                            </div>

                            <h2 className="set-password-title">Customer Portal Access</h2>
                            <p className="set-password-subtitle">
                                {checking
                                    ? 'Checking the code on your pawn ticket...'
                                    : 'Enter your registered email address to open your portal.'}
                            </p>

                            <div className="auth-status" role="status" aria-live="polite">
                                {checking && (
                                    <div className="qr-access-checking">
                                        <IonSpinner name="crescent" />
                                    </div>
                                )}

                                {!checking && codeMissing && (
                                    <div className="error-message">
                                        <IonIcon icon={alertCircleOutline} className="error-icon" />
                                        <p>
                                            This link has no access code. Scan the QR code on your pawn ticket again, or
                                            ask the shop for a reprinted ticket.
                                        </p>
                                    </div>
                                )}

                                {!checking && !codeMissing && !codeValid && (
                                    <div className="error-message">
                                        <IonIcon icon={alertCircleOutline} className="error-icon" />
                                        <p>
                                            This QR code is no longer valid, or it is locked after too many incorrect
                                            email addresses. Ask the shop for a new pawn ticket, or sign in with your
                                            email and password instead.
                                        </p>
                                    </div>
                                )}

                                {success && (
                                    <div className="success-message">
                                        <IonIcon icon={checkmarkCircleOutline} className="success-icon" />
                                        <p>Verified. Opening your portal...</p>
                                    </div>
                                )}

                                {!checking && codeValid && !success && error && (
                                    <div className="error-message">
                                        <IonIcon icon={alertCircleOutline} className="error-icon" />
                                        <p>{error}</p>
                                    </div>
                                )}
                            </div>

                            {!checking && codeValid && !success && (
                                <>
                                    <div className="password-field">
                                        <label className="password-label" htmlFor="portal-access-email">
                                            Registered email address
                                        </label>
                                        <div className="password-input-wrap no-toggle">
                                        <IonInput
                                            id="portal-access-email"
                                            ref={emailRef}
                                            type="email"
                                            inputmode="email"
                                            value={email}
                                            onIonInput={e => {
                                                setEmail(e.detail.value || '');
                                                if (error) setError('');
                                            }}
                                            onKeyDown={handleKeyDown}
                                            placeholder="you@example.com"
                                            className="password-input"
                                            aria-label="Registered email address"
                                            autocomplete="email"
                                            enterkeyhint="go"
                                        />
                                        </div>
                                    </div>

                                    <p className="qr-access-note">
                                        <IonIcon icon={lockClosedOutline} aria-hidden="true" />
                                        We only check that this address matches the account on the ticket. Your password
                                        is never shown or needed here.
                                    </p>

                                    <IonButton
                                        expand="block"
                                        className="auth-btn primary-btn ridge-btn"
                                        disabled={!canSubmit}
                                        onClick={handleSubmit}
                                    >
                                        {submitting ? <IonSpinner name="crescent" /> : 'Open my portal'}
                                    </IonButton>
                                </>
                            )}

                            <p className="qr-access-alt">
                                <IonIcon icon={mailOutline} aria-hidden="true" />
                                Prefer email? <a href="/forgot-password">Reset your password by email</a> instead.
                            </p>
                        </IonCardContent>
                    </IonCard>
                </div>
            </IonContent>
        </IonPage>
    );
};

export default PortalAccess;
