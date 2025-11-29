import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ApiConfigProvider } from '@/contexts/ApiConfigContext'
import { DeviceDataProvider } from '@/contexts/DeviceDataContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ZonesPage } from '@/pages/ZonesPage'

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <ApiConfigProvider>
          <DeviceDataProvider>
            <Routes>
              <Route path="/" element={<ZonesPage />} />
              <Route path="*" element={<ZonesPage />} />
            </Routes>
          </DeviceDataProvider>
        </ApiConfigProvider>
      </BrowserRouter>
    </LanguageProvider>
  )
}
