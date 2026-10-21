import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import DesktopSiteNotice from './components/DesktopSiteNotice.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      {/* Only appears on a phone that is showing the desktop version. */}
      <DesktopSiteNotice />
    </BrowserRouter>
  </StrictMode>,
)
