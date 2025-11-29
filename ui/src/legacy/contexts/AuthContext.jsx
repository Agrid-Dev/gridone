import { createContext, useContext, useMemo, useState } from 'react'

const AuthContext = createContext()

const simulateDelay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms))

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  const login = async (email, password) => {
    setIsAuthenticating(true)
    await simulateDelay()
    if (!email || !password) {
      setIsAuthenticating(false)
      throw new Error('Email and password are required')
    }
    setUser({
      email,
      name: email.split('@')[0],
      role: 'Operator',
    })
    setIsAuthenticating(false)
  }

  const logout = () => {
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAuthenticating,
      login,
      logout,
    }),
    [user, isAuthenticating],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
