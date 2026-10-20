import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getForSaleItems, holdEnds, login as apiLogin, requestPasswordReset, reserveItem, type SaleItem } from '../services/api';
import { useModal } from '../components/ModalProvider';
import {
    IonContent,
    IonPage,
    IonHeader,
    IonToolbar,
    IonButton,
    IonIcon,
    IonInput,
    IonModal,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonRouterLink,
    IonSpinner,
} from '@ionic/react';
import {
    arrowForwardOutline,
    cashOutline,
    checkmarkCircleOutline,
    locationOutline,
    mailOutline,
    personOutline,
    logInOutline,
    personAddOutline,
    closeOutline,
    refreshOutline,
    calculatorOutline,
    callOutline,
    eyeOffOutline,
    eyeOutline,
    menuOutline,
    shieldCheckmarkOutline,
    timeOutline,
} from 'ionicons/icons';
import FaqChatbot from '../components/FaqChatbot';
import BranchMap from '../components/BranchMap';
import ItemsSlider from '../components/ItemsSlider';
import GoldEstimate from '../components/GoldEstimate';
import './Landing.css';
import './LandingPolish.css';
import '../theme/ridge-button.css';
import './LandingRain.css';
import MotionToggle from '../components/MotionToggle';

// ---- ProductCard (same as before) ----
interface ProductCardProps {
    title: string;
    price: string;
    badge?: string;
    image?: string;
    category?: string;
    /** When a customer's hold on the item runs out, or null when it is free. */
    reservedUntil?: string | null;
    /** Reserve the item. Left out where there is nothing to reserve. */
    onReserve?: () => void;
    /**
     * A repeated copy in the sale marquee. Hidden from screen readers and
     * taken out of the tab order, so each item is announced and reached once.
     */
    clone?: boolean;
}

type LandingProduct = Omit<ProductCardProps, 'clone' | 'onReserve'> & { itemId: number; onReserve?: () => void };

const ProductCard: React.FC<ProductCardProps> = ({
    title,
    price,
    badge,
    image = 'https://picsum.photos/seed/' + title + '/400/300',
    category = 'Jewelry',
    reservedUntil = null,
    onReserve,
    clone = false,
}) => {
    const reserved = Boolean(reservedUntil && new Date(reservedUntil).getTime() > Date.now());

    return (
        // inert as well as aria-hidden: the Inquire link lives inside the
        // button's shadow DOM, where the host's tabIndex does not reach.
        <IonCard className={`product-card glass-card${clone ? ' is-clone' : ''}${reserved ? ' is-reserved' : ''}`} aria-hidden={clone ? 'true' : undefined} inert={clone || undefined}>
            <div className="product-image-wrapper">
                <img src={image} alt={title} className="product-image" />
                {badge && (
                    <div className="product-badge">
                        <span>{reserved ? 'Reserved' : badge}</span>
                    </div>
                )}
                <div className="product-category">{category}</div>
            </div>
            <IonCardHeader className="product-header">
                <IonCardTitle className="product-title">{title}</IonCardTitle>
                <IonCardSubtitle className="product-price">₱{price}</IonCardSubtitle>
            </IonCardHeader>
            <IonCardContent className="product-footer">
                <span className="product-price-label">Selling price</span>
                <IonButton fill="clear" size="small" className="product-action-btn" href="#contact" tabIndex={clone ? -1 : undefined}>
                    Inquire <IonIcon icon={arrowForwardOutline} slot="end" />
                </IonButton>
            </IonCardContent>
            {onReserve && (
                <button type="button" className="product-reserve-btn" onClick={onReserve} disabled={reserved} tabIndex={clone ? -1 : undefined}>
                    {reserved ? `Reserved until ${holdEnds(reservedUntil!)}` : 'Reserve for 2 days'}
                </button>
            )}
        </IonCard>
    );
};

/**
 * The items for sale as one row that scrolls right to left without end.
 *
 * The list is laid out twice (two equal halves) and the track slides by one
 * half, so the end of the loop lines up with its start. Each half repeats the
 * list as often as needed to be at least as wide as the row, so a short list
 * never leaves a gap. The first copy is the real one; every other copy is
 * hidden from screen readers and the keyboard.
 *
 * The motion itself lives in Landing.css: it runs unless the visitor has
 * asked for reduced motion, and then the row is a plain horizontal scroller
 * showing each item once.
 */
const SaleMarquee: React.FC<{ products: LandingProduct[] }> = ({ products }) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    // How many times the list repeats inside one half of the track.
    const [repeats, setRepeats] = useState(1);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const track = trackRef.current;
        if (!viewport || !track || products.length === 0) return;

        const measure = () => {
            const card = track.firstElementChild as HTMLElement | null;
            if (!card) return;
            const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
            const listWidth = products.length * (card.offsetWidth + gap);
            if (listWidth <= 0) return;
            setRepeats(Math.max(1, Math.ceil(viewport.clientWidth / listWidth)));
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [products]);

    const copies = repeats * 2;

    return (
        <div className="sale-marquee" ref={viewportRef}>
            <div className="sale-grid sale-marquee-track" ref={trackRef}>
                {Array.from({ length: copies }, (_, copy) => products.map((product, index) => (
                    <ProductCard
                        key={`${copy}-${index}`}
                        title={product.title}
                        price={product.price}
                        image={product.image}
                        category={product.category}
                        badge={product.badge}
                        reservedUntil={product.reservedUntil}
                        onReserve={product.onReserve}
                        clone={copy > 0}
                    />
                )))}
            </div>
        </div>
    );
};

type Service = {
    icon: string;
    title: string;
    /** The short line on the front of the card. */
    summary: string;
    /** The longer explanation on the back. */
    details: string;
};

const SERVICES: Service[] = [
    {
        icon: cashOutline,
        title: 'Gold Jewelry Pawning',
        summary: 'Turn gold jewelry into a fair, transparent cash when you need it.',
        details: 'We weigh your gold and check the karat in front of you, then quote on the spot. Bring one valid ID. 5% monthly interest, a 60 day term, plus a 7 day extension.',
    },
    {
        icon: refreshOutline,
        title: 'Pawn Renewal',
        summary: 'Keep your active pawn moving with a simple renewal process.',
        details: 'Pay the interest to extend your pawn for another 60 days, at the shop or online with GCash from the Customer Portal.',
    },
    {
        icon: checkmarkCircleOutline,
        title: 'Redemption Services',
        summary: 'Review your balance and redeem your items with confidence.',
        details: 'Bring your pawn ticket and a valid ID, pay the principal plus interest, and take your item home the same day. Tell us ahead in the Customer Portal so it is ready.',
    },
    {
        icon: shieldCheckmarkOutline,
        title: 'Secure Records',
        summary: 'Stay informed with organized records for every pawn transaction.',
        details: 'Every pawn, renewal, and redemption is logged under its ticket number. Log in to the Customer Portal to see your history anytime.',
    },
];

/**
 * A service card that turns over to show more detail.
 *
 * It flips on hover where there is a mouse, and on click, tap, Enter, or
 * Space everywhere, so touch and keyboard users get the back too. Both faces
 * stay in the document, so a screen reader reads the whole card either way.
 */
const ServiceFlipCard: React.FC<Service> = ({ icon, title, summary, details }) => {
    const [flipped, setFlipped] = useState(false);
    const toggle = () => setFlipped(current => !current);

    return (
        <div
            className={`service-flip${flipped ? ' is-flipped' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={flipped}
            aria-label={`${title}: ${flipped ? 'hide' : 'show'} details`}
            onClick={toggle}
            // A card clicked while hovered turns back once the mouse leaves.
            onMouseLeave={() => setFlipped(false)}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggle();
                }
            }}
        >
            <div className="service-flip-inner">
                <div className="service-card service-face service-face-front">
                    <IonIcon icon={icon} />
                    <h3>{title}</h3>
                    <p>{summary}</p>
                </div>
                <div className="service-card service-face service-face-back">
                    <h3>{title}</h3>
                    <p>{details}</p>
                </div>
            </div>
        </div>
    );
};

// ---- Login & Signup Modals (unchanged) ----
// (I'm omitting them here for brevity – you can copy them from the previous code)
// They remain identical.

const LoginModal: React.FC<{ isOpen: boolean; onClose: () => void; onSwitchToSignup?: () => void; onForgotPassword?: () => void; onLogin: (email: string, password: string) => Promise<string | null> }> = ({ isOpen, onClose, onForgotPassword, onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    // True while the sign in request is out, so the button shows a spinner
    // and a second click cannot send the request twice.
    const [signingIn, setSigningIn] = useState(false);
    const handleLogin = async () => {
        if (signingIn) return;
        if (!email || !password) {
            setError('Enter both your email address and password.');
            return;
        }
        setError('');
        setSigningIn(true);
        // onLogin returns null on success, or the reason the sign in failed.
        const failureReason = await onLogin(email, password).finally(() => setSigningIn(false));
        if (failureReason) {
            setError(failureReason);
            return;
        }
        onClose();
    };
    return (
        <IonModal isOpen={isOpen} onDidDismiss={onClose} className="auth-modal">
            <div className="modal-backdrop">
                <div className="modal-container glass-modal">
                    <div className="modal-header">
                        <span className="modal-close-label" onClick={onClose}><IonIcon icon={closeOutline} /> Close</span>
                        <IonButton fill="clear" onClick={onClose} className="close-btn"><IonIcon icon={closeOutline} /></IonButton>
                    </div>
                    <div className="modal-body">
                        <div className="auth-brand">
                            <img src="/pagasa.png" alt="Pag-Asa Pawnshop logo" />
                        </div>
                        <h2 className="modal-title">Login Page</h2>
                        <p className="modal-subtitle">Sign in to your SmartPawn account</p>
                        {/* Both fields share one structure, so the boxes match exactly. The eye
                            button sits inside the password box instead of in an item slot, which
                            used to take width from that box and push the icon above the input. */}
                        <div className="login-form">
                            <div className="login-field">
                                <label className="login-label" htmlFor="login-email">Email Address</label>
                                <div className="login-input-wrap">
                                    <IonInput id="login-email" type="email" value={email} onIonInput={e => setEmail(e.detail.value || '')} placeholder="you@example.com" className="login-input" aria-label="Email address" />
                                </div>
                            </div>
                            <div className="login-field">
                                <label className="login-label" htmlFor="login-password">Password</label>
                                <div className="login-input-wrap has-toggle">
                                    <IonInput id="login-password" type={showPassword ? 'text' : 'password'} value={password} onIonInput={e => setPassword(e.detail.value || '')} placeholder="Enter your password" className="login-input" aria-label="Password" />
                                    <button type="button" className="login-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                        <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        {onForgotPassword && (
                            <div className="auth-options">
                                <button type="button" className="forgot-link" onClick={onForgotPassword}>Forgot password?</button>
                            </div>
                        )}
                        <IonButton expand="block" className={`auth-btn primary-btn ridge-btn${signingIn ? ' is-busy' : ''}`} onClick={handleLogin} aria-busy={signingIn}>
                            {signingIn
                                ? <><IonSpinner name="crescent" className="auth-btn-spinner" slot="start" />Signing in...</>
                                : <><IonIcon icon={logInOutline} slot="start" />Sign In</>}
                        </IonButton>
                        {error && <p className="auth-error">{error}</p>}
                        <div className="auth-switch"><span>Customer accounts are created by Staff during intake.</span></div>
                    </div>
                </div>
            </div>
        </IonModal>
    );
};

const ForgotPasswordModal: React.FC<{ isOpen: boolean; onClose: () => void; onBackToLogin: () => void }> = ({ isOpen, onClose, onBackToLogin }) => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    // Shown when the visitor tries to close with an email typed but no link
    // sent yet, so the modal never disappears on them without a word.
    const [confirmClose, setConfirmClose] = useState(false);

    const requestClose = () => {
        if (email.trim() && !success && !loading) setConfirmClose(true);
        else onClose();
    };

    // The new password is set on the page the emailed link opens, not here.
    // Asking for it here would let anyone change an account they only know the
    // email address of.
    const handleSendLink = async () => {
        setError('');
        setSuccess('');
        if (!email.trim()) {
            setError('Enter the email address on your account.');
            return;
        }
        setLoading(true);
        try {
            const result = await requestPasswordReset(email.trim());
            setSuccess(result.message);
        } catch (resetError) {
            setError(resetError instanceof Error ? resetError.message : 'Unable to send the reset link.');
        } finally {
            setLoading(false);
        }
    };

    return (
        // Only the Close buttons close it; a stray click or tap outside does not.
        <IonModal isOpen={isOpen} backdropDismiss={false} onDidDismiss={() => { setConfirmClose(false); onClose(); }} className="auth-modal">
            <div className="modal-backdrop">
                <div className="modal-container glass-modal">
                    <div className="modal-header">
                        <span className="modal-close-label" onClick={requestClose}><IonIcon icon={closeOutline} /> Close</span>
                        <IonButton fill="clear" onClick={requestClose} className="close-btn"><IonIcon icon={closeOutline} /></IonButton>
                    </div>
                    <div className="modal-body">
                        <div className="auth-brand">
                            <img src="/pagasa.png" alt="Pag-Asa Pawnshop logo" />
                        </div>
                        <h2 className="modal-title">Reset Password</h2>
                        <p className="modal-subtitle">Enter your account email. We will send you a link to set a new password.</p>
                        {/* Same field structure as the login form, so the box lines up
                            with the title and the button the same way it does there. */}
                        <div className="login-form">
                            <div className="login-field">
                                <label className="login-label" htmlFor="reset-email">Email Address</label>
                                <div className="login-input-wrap">
                                    <IonInput id="reset-email" type="email" value={email} onIonInput={event => { setEmail(event.detail.value || ''); setSuccess(''); setConfirmClose(false); }} placeholder="you@example.com" className="login-input" aria-label="Email address" />
                                </div>
                            </div>
                        </div>
                        {confirmClose && (
                            <div className="auth-warning" role="alert">
                                <p>The reset link has not been sent yet. Close without sending it?</p>
                                <div className="auth-warning-actions">
                                    <button type="button" onClick={() => setConfirmClose(false)}>Keep editing</button>
                                    <button type="button" className="danger" onClick={onClose}>Close anyway</button>
                                </div>
                            </div>
                        )}
                        {error && <p className="auth-error">{error}</p>}
                        {success && <div className="auth-info-message"><p>{success}</p></div>}
                        <IonButton expand="block" className="auth-btn primary-btn ridge-btn" onClick={handleSendLink} disabled={loading || !email.trim()}>
                            {loading ? 'Sending link...' : 'Send Reset Link'}
                        </IonButton>
                        <div className="auth-switch"><IonRouterLink onClick={onBackToLogin}>Return to Login</IonRouterLink></div>
                    </div>
                </div>
            </div>
        </IonModal>
    );
};

const SignupModal: React.FC<{ isOpen: boolean; onClose: () => void; onSwitchToLogin: () => void; onRegister: (name: string, email: string, password: string) => void }> = ({ isOpen, onClose, onSwitchToLogin, onRegister }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const handleSignup = () => {
        if (!name || !email || password.length < 6 || password !== confirmPassword) {
            setError('Complete all fields and use matching passwords of 6+ characters.');
            return;
        }
        onRegister(name, email, password);
        setError('');
        onClose();
    };
    return (
        <IonModal isOpen={isOpen} onDidDismiss={onClose} className="auth-modal">
            <div className="modal-backdrop">
                <div className="modal-container glass-modal">
                    <div className="modal-header">
                        <span className="modal-close-label" onClick={onClose}><IonIcon icon={closeOutline} /> Close</span>
                        <IonButton fill="clear" onClick={onClose} className="close-btn"><IonIcon icon={closeOutline} /></IonButton>
                    </div>
                    <div className="modal-body">
                        <div className="auth-brand">
                            <img src="/pagasa.png" alt="Pag-Asa Pawnshop logo" />
                        </div>
                        <h2 className="modal-title">Create Account</h2>
                        <p className="modal-subtitle">Register for your SmartPawn account</p>
                        <div className="login-form">
                            <div className="login-field">
                                <label className="login-label" htmlFor="signup-name">Full Name</label>
                                <div className="login-input-wrap">
                                    <IonInput id="signup-name" type="text" value={name} onIonChange={e => setName(e.detail.value || '')} placeholder="John Doe" className="login-input" aria-label="Full Name" />
                                </div>
                            </div>
                            <div className="login-field">
                                <label className="login-label" htmlFor="signup-email">Email Address</label>
                                <div className="login-input-wrap">
                                    <IonInput id="signup-email" type="email" value={email} onIonChange={e => setEmail(e.detail.value || '')} placeholder="you@example.com" className="login-input" aria-label="Email Address" />
                                </div>
                            </div>
                            <div className="login-field">
                                <label className="login-label" htmlFor="signup-password">Password</label>
                                <div className="login-input-wrap">
                                    <IonInput id="signup-password" type="password" value={password} onIonChange={e => setPassword(e.detail.value || '')} placeholder="Create a strong password" className="login-input" aria-label="Password" />
                                </div>
                            </div>
                            <div className="login-field">
                                <label className="login-label" htmlFor="signup-confirm">Confirm Password</label>
                                <div className="login-input-wrap">
                                    <IonInput id="signup-confirm" type="password" value={confirmPassword} onIonChange={e => setConfirmPassword(e.detail.value || '')} placeholder="Confirm your password" className="login-input" aria-label="Confirm Password" />
                                </div>
                            </div>
                        </div>
                        <IonButton expand="block" className="auth-btn primary-btn ridge-btn" onClick={handleSignup}><IonIcon icon={personAddOutline} slot="start" />Create Account</IonButton>
                        {error && <p className="auth-error">{error}</p>}
                        <div className="auth-switch">
                            <span>Already have an account?</span>
                            <IonRouterLink onClick={onSwitchToLogin}>Sign In</IonRouterLink>
                        </div>
                    </div>
                </div>
            </div>
        </IonModal>
    );
};

// ---- Main Landing Page ----
const Landing: React.FC = () => {
    const navigate = useNavigate();
    const [showLogin, setShowLogin] = useState(false);
    const [showSignup, setShowSignup] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // At the top of the page the header is see-through so the hero image
    // shows behind it; once scrolled it turns denser glass.
    const [atTop, setAtTop] = useState(true);
    // Bumped by the estimate section's "Ask a Question" button to open the FAQ chat.
    const [chatOpenSignal, setChatOpenSignal] = useState(0);

    const openLogin = () => {
        setShowSignup(false);
        setShowForgotPassword(false);
        setShowLogin(true);
        setMenuOpen(false);
    };

    const openSignup = () => {
        setShowLogin(false);
        setShowSignup(true);
        setMenuOpen(false);
    };

    // Each modal closes only itself. A modal's onDidDismiss fires after its
    // closing animation, so a shared "close all" handler used to shut the
    // modal that had just opened in its place (Login -> Forgot password).
    const closeLogin = () => setShowLogin(false);
    const closeSignup = () => setShowSignup(false);
    const closeForgotPassword = () => setShowForgotPassword(false);

    const openForgotPassword = () => {
        setShowLogin(false);
        setShowForgotPassword(true);
    };

    const toggleMenu = () => setMenuOpen(!menuOpen);
    const closeMenu = () => setMenuOpen(false);

    const handleLogin = async (email: string, password: string): Promise<string | null> => {
        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password.trim();

        try {
            const result = await apiLogin(cleanEmail, cleanPassword);
            navigate(`/${result.role}/dashboard`);
            return null;
        } catch (loginError) {
            // Report what actually went wrong. A swallowed network or CORS
            // failure used to look identical to a wrong password, which made
            // a server that was down impossible to tell apart from a typo.
            console.error('Login failed', loginError);
            return loginError instanceof Error ? loginError.message : 'Unable to sign in right now.';
        }
    };

    const handleRegister = (name: string, email: string, password: string) => {
        localStorage.setItem('smartpawn_customer', JSON.stringify({ name, email, password }));
        navigate('/customer/dashboard');
    };

    // Items for sale are whatever the shop has actually listed. The list starts
    // empty so a visitor is never shown an item the pawnshop does not hold.
    const [products, setProducts] = useState<LandingProduct[]>([]);
    const [saleLoading, setSaleLoading] = useState(true);
    const [saleError, setSaleError] = useState('');

    const modal = useModal();
    // Reloads after a reservation so the card shows who holds what.
    const loadProducts = useCallback(() => getForSaleItems()
        .then((items: SaleItem[]) => setProducts(items.map(item => ({ itemId: item.items_id, title: item.description, price: String(Math.round(Number(item.sale_price)).toLocaleString()), category: item.category.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' '), badge: 'For Sale', image: item.photo_urls?.[0] || undefined, reservedUntil: item.reserved_until ?? null }))))
        .catch(error => setSaleError(error instanceof Error ? error.message : 'Unable to load sale items.'))
        .finally(() => setSaleLoading(false)), []);

    useEffect(() => { loadProducts(); }, [loadProducts]);

    /**
     * Reserve from the landing page. Only a signed in customer can hold an
     * item; anyone else is offered the sign in dialog, and after signing in
     * reserves from the Customer Portal's Items for Sale tab.
     */
    const reserveFromLanding = async (product: LandingProduct) => {
        const signedInCustomer = Boolean(localStorage.getItem('smartpawn_api_token') && localStorage.getItem('smartpawn_customer'));
        if (!signedInCustomer) {
            const signIn = await modal.confirm({
                title: 'Sign in to reserve',
                message: 'Reserving holds an item for you for 2 shop days. Sign in to your customer account, then open Items for Sale in your portal.',
                confirmLabel: 'Sign in',
            });
            if (signIn) openLogin();
            return;
        }

        const confirmed = await modal.confirm({
            title: 'Reserve this item?',
            message: `We will hold ${product.title} (₱${product.price}) for you for 2 shop days. Pay and pick it up at the shop before the hold ends.`,
            confirmLabel: 'Reserve',
        });
        if (!confirmed) return;

        try {
            const reservation = await reserveItem(product.itemId);
            await modal.success({ title: 'Reserved', message: `${product.title} is held for you until ${holdEnds(reservation.expires_at)}. See it under Items for Sale in your portal.` });
        } catch (error) {
            await modal.error({ message: error instanceof Error ? error.message : 'Unable to reserve this item.' });
        }
        loadProducts();
    };

    return (
        <IonPage>
            {/* ---- Header / Navbar ---- */}
            <IonHeader className={`landing-header ${atTop ? 'at-top' : ''}`}>
                <IonToolbar className="navbar glass-nav">
                    <div className="nav-container">
                        <div className="nav-brand">
                            <img src="/pagasa.png" alt="Pag-Asa Pawnshop logo" className="brand-mark" />
                            <div className="brand-copy">
                                <strong>PAG-ASA PAWNSHOP</strong>
                                <span>Your Trusted Pawnshop</span>
                            </div>
                        </div> 

                        {/* Desktop nav links */}
                        <div className="nav-links desktop-nav">
                            <a href="#home" className="nav-link active">Home</a>
                            <a href="#about" className="nav-link">About</a>
                            <a href="#services" className="nav-link">Services</a>
                            <a href="#estimate" className="nav-link">Get an Estimate</a>
                            <a href="#items-for-sale" className="nav-link">Items for Sale</a>
                            <a href="#contact" className="nav-link">Contact</a>
                        </div>

                        <div className="nav-actions">
                            <MotionToggle className="landing-motion-toggle" />
                            <IonButton fill="clear" className="nav-btn" onClick={openLogin}>
                                <IonIcon icon={personOutline} slot="start" />
                                Login
                            </IonButton>
                            {/* Hamburger menu toggle (visible on mobile) */}
                            <IonButton
                                fill="clear"
                                className={`menu-toggle ${menuOpen ? 'menu-open' : ''}`}
                                onClick={toggleMenu}
                                aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                            >
                                <IonIcon icon={menuOpen ? closeOutline : menuOutline} />
                            </IonButton>
                        </div>
                    </div>

                </IonToolbar>
                <div className={`mobile-dropdown ${menuOpen ? 'open' : ''}`}>
                    <div className="dropdown-backdrop" onClick={closeMenu}></div>
                    <div className="dropdown-content glass-nav">
                        <nav className="dropdown-nav">
                            <a href="#home" className="dropdown-link active" onClick={closeMenu}>Home</a>
                            <a href="#about" className="dropdown-link" onClick={closeMenu}>About</a>
                            <a href="#services" className="dropdown-link" onClick={closeMenu}>Services</a>
                            <a href="#estimate" className="dropdown-link" onClick={closeMenu}>Get an Estimate</a>
                            <a href="#items-for-sale" className="dropdown-link" onClick={closeMenu}>Items for Sale</a>
                            <a href="#contact" className="dropdown-link" onClick={closeMenu}>Contact</a>
                            <div className="dropdown-actions">
                                <IonButton fill="outline" onClick={openLogin}>Login</IonButton>
                            </div>
                        </nav>
                    </div>
                </div>
            </IonHeader>

            <IonContent className="landing-content" fullscreen scrollEvents onIonScroll={(event) => setAtTop(event.detail.scrollTop < 40)}>
                <div className="content-wrapper">
                    <section className="hero-section landing-section" id="home">
                        <div className="hero-bg" aria-hidden="true">
                            <div className="hero-bg-image" />
                            <div className="hero-bg-shade" />
                        </div>
                        <div className="hero-text-col">
                            <div className="hero-kicker"><span>FAIR VALUE</span><span>TRUSTED SERVICE</span></div>
                            <h1 className="hero-title">Smart Pawn — <span className="highlight">Fair Value, Every Day.</span></h1>
                            <p className="hero-description">Pag-Asa Pawnshop makes pawning simple, transparent, and dependable. Get a fair assessment for your valuables or find quality expired/unclaimed items in one trusted place.</p>
                            <div className="hero-buttons"><IonButton className="hero-btn primary-btn" onClick={openLogin}><IonIcon icon={logInOutline} slot="start" />Get Started</IonButton><IonButton fill="outline" className="hero-btn outline-btn" href="#estimate"><IonIcon icon={calculatorOutline} slot="start" />Get an Estimate</IonButton><a className="hero-text-link" href="#services">Explore our services <IonIcon icon={arrowForwardOutline} /></a></div>
                        </div>
                        <div className="hero-visual-col"><ItemsSlider /></div>
                    </section>

                    {/* Rain behind every section between the hero and the footer.
                        The hero and footer keep their own backgrounds. */}
                    <div className="landing-rain">
                        <section className="about-section landing-section" id="about"><div className="section-eyebrow">ABOUT PAG-ASA</div><div className="about-layout"><div><h2>Modern tools for a pawnshop people already trust.</h2></div><p>Pag-Asa Pawnshop serves our community with honest appraisals and practical financial support. SmartPawn brings that same purpose online, helping customers track pawns, renew pawns, and explore available items with clarity.</p></div></section>

                        <section className="services-section landing-section" id="services"><div className="section-heading-block"><div className="section-eyebrow">WHAT WE DO</div><h2>Services built around your next step.</h2></div><div className="service-grid">{SERVICES.map(service => <ServiceFlipCard key={service.title} {...service} />)}</div></section>

                        <GoldEstimate onAskQuestion={() => setChatOpenSignal(signal => signal + 1)} />

                        <section className="sale-section landing-section" id="items-for-sale"><div className="section-heading-block sale-heading"><div><div className="section-eyebrow">AVAILABLE NOW</div><h2>Items for sale</h2></div><p>Quality expired/unclaimed items, presented with the details you need.</p></div>{saleLoading && <p>Loading available items...</p>}{saleError && <p className="sale-error">{saleError}</p>}{!saleLoading && !saleError && products.length === 0 && <p>No items are listed for sale right now.</p>}{products.length > 0 && <SaleMarquee products={products.map(product => ({ ...product, onReserve: () => reserveFromLanding(product) }))} />}</section>

                        <section className="contact-section landing-section" id="contact"><div className="contact-copy"><div className="section-eyebrow">COME SEE US</div><h2>Let’s talk about what you need.</h2><p>Visit Pag-Asa Pawnshop or reach out to our team for help with pawning, renewals, redemption, or an item for sale.</p><div className="contact-details"><span><IonIcon icon={locationOutline} />Kauswagan, Cagayan de Oro City, Misamis Orienta
                        </span><span><IonIcon icon={callOutline} />0970 885 6182</span><span><IonIcon icon={mailOutline} />renierjemorellorivas@gmail.com</span><span><IonIcon icon={timeOutline} />Monday–Saturday · 9:00 AM–6:00 PM</span></div></div><BranchMap /></section>
                    </div>

                    <footer className="landing-footer"><div className="footer-container"><div className="footer-brand"><img src="/pagasa.png" alt="Pag-Asa Pawnshop logo" /><div><strong>PAG-ASA PAWNSHOP</strong><p className="footer-desc">Fair value. Every day.</p></div></div><div className="footer-links"><a href="#about">About</a><a href="#services">Services</a><a href="#estimate">Get an Estimate</a><a href="#items-for-sale">Items for Sale</a><a href="#contact">Contact</a></div><div className="footer-copy">&copy; 2026 Pag-Asa Pawnshop. All rights reserved.</div></div></footer>
                </div>

                <LoginModal isOpen={showLogin} onClose={closeLogin} onSwitchToSignup={openSignup} onForgotPassword={openForgotPassword} onLogin={handleLogin} />
                <SignupModal isOpen={showSignup} onClose={closeSignup} onSwitchToLogin={openLogin} onRegister={handleRegister} />
                <ForgotPasswordModal isOpen={showForgotPassword} onClose={closeForgotPassword} onBackToLogin={openLogin} />

                <FaqChatbot openSignal={chatOpenSignal} />
            </IonContent>
        </IonPage>
    );
};

export default Landing;