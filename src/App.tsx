import { Suspense } from 'react'
import { SettingsPage } from './components/SettingsPage'
import './index.css'

function App() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-600">Loading settings...</div>}>
      <SettingsPage />
    </Suspense>
  )
}

export default App
