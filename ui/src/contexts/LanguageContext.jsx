import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { translations } from '@/i18n/translations'

const LanguageContext = createContext()

const LANGUAGE_STORAGE_KEY = 'agrid.language'
const AVAILABLE_LANGUAGES = Object.keys(translations)
const DEFAULT_LANGUAGE = AVAILABLE_LANGUAGES.includes('en') ? 'en' : AVAILABLE_LANGUAGES[0]

const isBrowser = typeof window !== 'undefined'

const getStoredLanguage = () => {
  if (!isBrowser) return null
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored && AVAILABLE_LANGUAGES.includes(stored)) {
    return stored
  }
  if (typeof window.navigator?.language === 'string') {
    const browserLocale = window.navigator.language.slice(0, 2)
    if (AVAILABLE_LANGUAGES.includes(browserLocale)) {
      return browserLocale
    }
  }
  return null
}

const interpolate = (message, values) => {
  if (typeof message !== 'string' || !values) return message
  return message.replace(/\{(\w+)\}/g, (_, token) => {
    if (values[token] === 0) return '0'
    return values[token] ?? `{${token}}`
  })
}

const getNestedValue = (language, key) => {
  const segments = key.split('.')
  let current = translations[language]
  for (const segment of segments) {
    if (current && typeof current === 'object') {
      current = current[segment]
    } else {
      return undefined
    }
  }
  return current
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => getStoredLanguage() || DEFAULT_LANGUAGE)

  useEffect(() => {
    if (isBrowser) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    }
  }, [language])

  const changeLanguage = useCallback((nextLanguage) => {
    if (!AVAILABLE_LANGUAGES.includes(nextLanguage)) return
    setLanguage(nextLanguage)
  }, [])

  const value = useMemo(() => {
    const translate = (key, options = {}) => {
      if (!key) return ''
      const { defaultValue, values } = options
      const raw = getNestedValue(language, key)
      const fallback = typeof defaultValue === 'function' ? defaultValue(values) : defaultValue
      const message = raw ?? fallback ?? key
      if (typeof message === 'string') {
        return interpolate(message, values)
      }
      return message
    }

    return {
      language,
      setLanguage: changeLanguage,
      availableLanguages: AVAILABLE_LANGUAGES,
      t: translate,
    }
  }, [language, changeLanguage])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useTranslation() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider')
  }
  return context
}
