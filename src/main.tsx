import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import './index.css'
import App from './App.tsx'
import { EvoluProvider, evolu } from './evolu'
import { BrowserRouter } from 'react-router-dom'
import { ConfirmProvider } from './components/ConfirmProvider'

// Polyfill Buffer for bip39
globalThis.Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EvoluProvider value={evolu}>
      <BrowserRouter>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </BrowserRouter>
    </EvoluProvider>
  </StrictMode>,
)
