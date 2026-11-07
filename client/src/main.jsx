import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
// The loading animations every page uses (components/Loaders.jsx).
import './styles/loaders.css'
// The page wipe between pages (components/PageTransition.jsx).
import './styles/transitions.css'
import { ScreenTransition } from './components/PageTransition.jsx'
import DesktopSiteNotice from './components/DesktopSiteNotice.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/* The band that sweeps across when another part of the site opens. */}
      <ScreenTransition>
        <App />
      </ScreenTransition>
      {/* Only appears on a phone that is showing the desktop version. */}
      <DesktopSiteNotice />
    </BrowserRouter>
  </StrictMode>,
)
