import React from 'react';
import { Navigate, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import Landing from './pages/Landing';          // <-- import your new Landing page
import SetPassword from './pages/SetPassword';
import CustomerPortal from './pages/CustomerPortal';
import StaffPortal from './staff';
import AdminPortal from './admin/AdminPortal';
// import Home from './pages/Home';             // (optional, keep if you still need it)

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */
/* import '@ionic/react/css/palettes/dark.always.css'; */
/* import '@ionic/react/css/palettes/dark.class.css'; */
import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';

setupIonicReact();

const RequireRole: React.FC<{ storageKey: string; redirect: string; children: React.ReactNode }> = ({ storageKey, redirect, children }) => {
  const authenticated = typeof localStorage !== 'undefined'
    && Boolean(localStorage.getItem(storageKey))
    && Boolean(localStorage.getItem('smartpawn_api_token'));
  return authenticated ? <>{children}</> : <Navigate to={redirect} replace />;
};

const App: React.FC = () => (
  <IonApp>
    <IonReactRouter>
      <IonRouterOutlet>
        {/* Make Landing the default page */}
        <Route path="/" element={<Landing />} />
        <Route path="/activate" element={<SetPassword />} />
        <Route path="/reset-password" element={<SetPassword />} />
        <Route path="/forgot-password" element={<SetPassword />} />
        <Route path="/customer/dashboard" element={<RequireRole storageKey="smartpawn_customer" redirect="/"><CustomerPortal /></RequireRole>} />
        <Route path="/staff/dashboard" element={<RequireRole storageKey="smartpawn_staff" redirect="/"><StaffPortal /></RequireRole>} />
        <Route path="/admin/dashboard" element={<RequireRole storageKey="smartpawn_admin" redirect="/"><AdminPortal /></RequireRole>} />
        {/* If you still want to keep the Home page, add it as another route */}
        {/* <Route path="/home" element={<Home />} /> */}
        {/* Redirect any unknown paths to landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </IonRouterOutlet>
    </IonReactRouter>
  </IonApp>
);

export default App;