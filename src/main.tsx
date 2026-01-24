import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import './index.css'
import App from './App.tsx'
import { EvoluProvider, evolu } from './evolu'

// Polyfill Buffer for bip39
globalThis.Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EvoluProvider value={evolu}>
      <App />
    </EvoluProvider>
  </StrictMode>,
)
