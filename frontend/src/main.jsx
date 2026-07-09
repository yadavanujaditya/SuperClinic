import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SuperMemoryPage from './SuperMemoryPage.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { AuthGate } from './AuthScreens.jsx'

// Vanity redirect links (shareable on socials) — bypass the app entirely, no login needed.
const VANITY_REDIRECTS = {
  '/moproprep': 'https://www.moproprep.in/',
  '/dnbproprep': 'https://dnbproprep.com/',
};
const redirectTarget = VANITY_REDIRECTS[window.location.pathname];

if (redirectTarget) {
  window.location.replace(redirectTarget);
} else {
  const isSuperMemoryTab = window.location.pathname === '/supermemory';
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AuthProvider>
        <AuthGate>
          {isSuperMemoryTab ? <SuperMemoryPage /> : <App />}
        </AuthGate>
      </AuthProvider>
    </StrictMode>,
  )
}
