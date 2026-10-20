import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { activate, resetPassword } from '../services/api';
import {
    IonContent,
    IonPage,
    IonHeader,
    IonToolbar,
    IonButton,
    IonIcon,
    IonInput,
    IonCard,
    IonCardContent,
    IonSpinner,
} from '@ionic/react';
import {
    closeOutline,
    eyeOffOutline,
    eyeOutline,
    checkmarkCircleOutline,
    alertCircleOutline,
    checkmarkOutline,
    ellipseOutline,
    lockClosedOutline,
    warningOutline,
} from 'ionicons/icons';
import './SetPassword.css';
import '../theme/ridge-button.css';

/** How long the success card stays up before the login screen takes over. */
const REDIRECT_SECONDS = 3;

type Strength = { score: number; label: string; key: 'weak' | 'fair' | 'good' | 'strong' };

/**
 * Scores a password out of four so the meter can encourage a longer, more
 * varied password without ever blocking one that meets the API's own rule.
 */
function scorePassword(password: string): Strength {
    if (password.length < 8) return { score: 1, label: 'Too short', key: 'weak' };

    let score = 1;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;

    if (score === 1) return { score: 1, label: 'Weak', key: 'weak' };
    if (score === 2) return { score: 2, label: 'Fair', key: 'fair' };
    if (score === 3) return { score: 3, label: 'Good', key: 'good' };
    return { score: 4, label: 'Strong', key: 'strong' };
}

const SetPassword: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    // The same page serves two links from two different emails: the activation
    // link a new customer gets, and the reset link an existing one asks for.
    // The path says which, and each calls its own endpoint.
    const isReset = location.pathname.startsWith('/reset-password');
    const linkName = isReset ? 'password reset' : 'activation';

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [countdown, setCountdown] = useState(REDIRECT_SECONDS);
    const [loading, setLoading] = useState(false);
    const passwordRef = useRef<HTMLIonInputElement>(null);

    // A missing token is fatal: no form can fix it, so the page shows the
    // explanation on its own. Every other error sits above a form the customer
    // can still correct and submit again.
    const tokenMissing = !token;

    const strength = useMemo(() => scorePassword(password), [password]);
    const longEnough = password.length >= 8;
    const matches = password.length > 0 && password === confirmPassword;
    const canSubmit = longEnough && matches && !loading && !tokenMissing;

    useEffect(() => {
        if (!success) return;
        // Count down visibly, then hand over to the login screen. The interval
        // is cleared on unmount so no navigation fires after the page is gone.
        const timer = window.setInterval(() => {
            setCountdown(current => {
                if (current <= 1) {
                    window.clearInterval(timer);
                    navigate('/');
                    return 0;
                }
                return current - 1;
            });
        }, 1000);
        return () => window.clearInterval(timer);
    }, [success, navigate]);

    useEffect(() => {
        if (!tokenMissing) passwordRef.current?.setFocus();
    }, [tokenMissing]);

    /** Clears a stale error the moment the customer starts fixing the field. */
    const handleChange = (setter: (value: string) => void) => (value: string) => {
        setter(value);
        if (error) setError('');
    };

    const trackCapsLock = (event: React.KeyboardEvent) => {
        setCapsLock(event.getModifierState ? event.getModifierState('CapsLock') : false);
    };

    const handleSubmit = async () => {
        setError('');

        if (!password || !confirmPassword) {
            setError('Please enter and confirm your new password.');
            return;
        }

        if (!longEnough) {
            setError('Password must be at least 8 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (!token) {
            setError('Invalid or missing ' + linkName + ' token.');
            return;
        }

        setLoading(true);
        try {
            if (isReset) {
                await resetPassword(token, password, confirmPassword);
            } else {
                await activate(token, password, confirmPassword);
            }
            setSuccess(true);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to set password. Please try again.';
            setError(
                errorMessage.includes('Invalid or expired token')
                    ? `This ${linkName} link is no longer valid. Ask for a new one and try again.`
                    : errorMessage,
            );
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        trackCapsLock(event);
        if (event.key === 'Enter' && canSubmit) handleSubmit();
    };

    const goToLogin = (event: React.MouseEvent) => {
        event.preventDefault();
        navigate('/');
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

                            <h2 className="set-password-title">
                                {success ? 'You are all set' : isReset ? 'Reset Your Password' : 'Set New Password'}
                            </h2>
                            <p className="set-password-subtitle">
                                {success
                                    ? 'Sign in with your new password.'
                                    : 'Create a strong password for your account'}
                            </p>

                            <div className="auth-status" role="status" aria-live="polite">
                                {success && (
                                    <div className="success-message">
                                        <IonIcon icon={checkmarkCircleOutline} className="success-icon" />
                                        <p>
                                            {isReset ? 'Password reset successfully!' : 'Password set successfully!'}{' '}
                                            Taking you to login in {countdown}s...
                                        </p>
                                    </div>
                                )}

                                {!success && tokenMissing && (
                                    <div className="error-message">
                                        <IonIcon icon={alertCircleOutline} className="error-icon" />
                                        <p>
                                            This {linkName} link is missing its token. Open the link straight from your
                                            email, or ask for a new one.
                                        </p>
                                    </div>
                                )}

                                {!success && !tokenMissing && error && (
                                    <div className="error-message">
                                        <IonIcon icon={alertCircleOutline} className="error-icon" />
                                        <p>{error}</p>
                                    </div>
                                )}
                            </div>

                            {success && (
                                <IonButton expand="block" className="auth-btn primary-btn ridge-btn" onClick={() => navigate('/')}>
                                    Go to login now
                                </IonButton>
                            )}

                            {!success && !tokenMissing && (
                                <>
                                    {/* Both fields share one structure, so their boxes, padding,
                                        and eye buttons are identical. The eye button sits inside the
                                        box, centered on it; the input reserves room on the right so
                                        typed text never runs under it. */}
                                    <div className="password-form">
                                        <div className="password-field">
                                            <label className="password-label" htmlFor="set-password-new">
                                                New Password
                                            </label>
                                            <div className="password-input-wrap">
                                                <IonInput
                                                    ref={passwordRef}
                                                    id="set-password-new"
                                                    type={showPassword ? 'text' : 'password'}
                                                    value={password}
                                                    onIonInput={e => handleChange(setPassword)(e.detail.value || '')}
                                                    onKeyDown={handleKeyDown}
                                                    onKeyUp={trackCapsLock}
                                                    onIonBlur={() => setCapsLock(false)}
                                                    placeholder="At least 8 characters"
                                                    className="password-input"
                                                    aria-label="New password"
                                                    autocomplete="new-password"
                                                    enterkeyhint="next"
                                                />
                                                <button
                                                    type="button"
                                                    className="password-toggle"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                >
                                                    <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                                                </button>
                                            </div>

                                            {password && (
                                                <div className="strength-meter">
                                                    <div className="strength-track">
                                                        {[1, 2, 3, 4].map(step => (
                                                            <span
                                                                key={step}
                                                                className={
                                                                    step <= strength.score
                                                                        ? `strength-bar filled strength-${strength.key}`
                                                                        : 'strength-bar'
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                    <span className={`strength-label strength-${strength.key}`}>
                                                        {strength.label}
                                                    </span>
                                                </div>
                                            )}

                                            {capsLock && (
                                                <p className="caps-warning">
                                                    <IonIcon icon={warningOutline} />
                                                    Caps Lock is on
                                                </p>
                                            )}
                                        </div>

                                        <div className="password-field">
                                            <label className="password-label" htmlFor="set-password-confirm">
                                                Confirm Password
                                            </label>
                                            <div className="password-input-wrap">
                                                <IonInput
                                                    id="set-password-confirm"
                                                    type={showConfirmPassword ? 'text' : 'password'}
                                                    value={confirmPassword}
                                                    onIonInput={e => handleChange(setConfirmPassword)(e.detail.value || '')}
                                                    onKeyDown={handleKeyDown}
                                                    onKeyUp={trackCapsLock}
                                                    onIonBlur={() => setCapsLock(false)}
                                                    placeholder="Re-enter your password"
                                                    className="password-input"
                                                    aria-label="Confirm password"
                                                    autocomplete="new-password"
                                                    enterkeyhint="done"
                                                />
                                                <button
                                                    type="button"
                                                    className="password-toggle"
                                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                                >
                                                    <IonIcon icon={showConfirmPassword ? eyeOffOutline : eyeOutline} />
                                                </button>
                                            </div>
                                        </div>

                                        <ul className="password-requirements">
                                            <li className={longEnough ? 'met' : 'unmet'}>
                                                <IonIcon icon={longEnough ? checkmarkOutline : ellipseOutline} />
                                                At least 8 characters
                                            </li>
                                            <li className={matches ? 'met' : 'unmet'}>
                                                <IonIcon icon={matches ? checkmarkOutline : ellipseOutline} />
                                                Passwords match
                                            </li>
                                        </ul>
                                    </div>

                                    <IonButton
                                        expand="block"
                                        className="auth-btn primary-btn ridge-btn"
                                        onClick={handleSubmit}
                                        disabled={!canSubmit}
                                    >
                                        {loading ? (
                                            <>
                                                <IonSpinner name="crescent" className="btn-spinner" />
                                                Setting password...
                                            </>
                                        ) : (
                                            <>
                                                <IonIcon icon={lockClosedOutline} slot="start" />
                                                {isReset ? 'Reset Password' : 'Set Password'}
                                            </>
                                        )}
                                    </IonButton>
                                </>
                            )}

                            <div className="auth-footer">
                                <span>
                                    Return to{' '}
                                    <a href="/" className="footer-link" onClick={goToLogin}>
                                        Login
                                    </a>
                                </span>
                            </div>
                        </IonCardContent>
                    </IonCard>
                </div>
            </IonContent>
        </IonPage>
    );
};

export default SetPassword;
