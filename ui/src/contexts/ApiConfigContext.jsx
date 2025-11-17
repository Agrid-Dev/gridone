import { createContext, useContext, useMemo, useState } from 'react'
import { API_MODES, createApiClient } from '@/services/apiClient'

const ApiConfigContext = createContext()

const DEFAULT_ENDPOINTS = {
  mock: { http: API_MODES.mock.http, ws: API_MODES.mock.ws },
  local: { http: API_MODES.local.http, ws: API_MODES.local.ws },
  cloud: { http: API_MODES.cloud.http, ws: API_MODES.cloud.ws },
}

export function ApiConfigProvider({ children }) {
  const [mode, setMode] = useState('mock')
  const [endpoints, setEndpoints] = useState(DEFAULT_ENDPOINTS)

  const updateEndpoint = (targetMode, partial) => {
    setEndpoints((prev) => ({
      ...prev,
      [targetMode]: {
        ...prev[targetMode],
        ...partial,
      },
    }))
  }

  const apiClient = useMemo(
    () =>
      createApiClient({
        mode,
        endpoints: endpoints[mode],
      }),
    [mode, endpoints],
  )

  const value = {
    mode,
    setMode,
    endpoints,
    updateEndpoint,
    apiClient,
    activeEndpoint: endpoints[mode],
    apiModes: API_MODES,
  }

  return <ApiConfigContext.Provider value={value}>{children}</ApiConfigContext.Provider>
}

export function useApiConfig() {
  const ctx = useContext(ApiConfigContext)
  if (!ctx) {
    throw new Error('useApiConfig must be used within ApiConfigProvider')
  }
  return ctx
}
