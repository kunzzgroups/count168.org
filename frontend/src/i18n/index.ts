import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '@/locales/en.json'
import zh from '@/locales/zh.json'

const STORAGE_KEY = 'i18nextLng'

function initialLanguage(): 'zh' | 'en' {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'zh') {
    return saved
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  }
  return 'zh'
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  if (lng === 'zh' || lng === 'en') {
    localStorage.setItem(STORAGE_KEY, lng)
  }
})

export default i18n
