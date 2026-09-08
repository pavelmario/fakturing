import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import './index.css'
import { EvoluProvider, evolu } from './evolu'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ConfirmProvider } from './components/ConfirmProvider'

// Polyfill Buffer for bip39
globalThis.Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EvoluProvider value={evolu}>
      {/* The dialogs sit outside the router: a page being navigated away
          from asks its question through them. */}
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </EvoluProvider>
  </StrictMode>,
)
