import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslation } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'

export function LanguageSwitcher({ className }) {
  const { language, setLanguage, availableLanguages, t } = useTranslation()
  const label = t('language.label', { defaultValue: 'Language' })
  const placeholder = t('language.placeholder', { defaultValue: 'Select language' })

  return (
    <Select value={language} onValueChange={setLanguage}>
      <SelectTrigger className={cn('w-32', className)} aria-label={label} title={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {availableLanguages.map((code) => (
          <SelectItem key={code} value={code}>
            {t(`languages.${code}`, { defaultValue: code.toUpperCase() })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
