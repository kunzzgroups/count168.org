import { apiUrl } from './api'

let moneyDecimalDepsPromise: Promise<void> | null = null

function loadScriptBySrc(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
    if (existing) {
      if ((existing as { __c168Loaded?: boolean }).__c168Loaded) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), {
        once: true,
      })
      return
    }

    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => {
      ;(s as { __c168Loaded?: boolean }).__c168Loaded = true
      resolve()
    }
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(s)
  })
}

export function ensureMoneyDecimalDeps(): Promise<void> {
  if (!moneyDecimalDepsPromise) {
    moneyDecimalDepsPromise = (async () => {
      await loadScriptBySrc(apiUrl('/js/decimal.min.js'))
      await loadScriptBySrc(apiUrl('/js/money-decimal.js'))
    })()
  }
  return moneyDecimalDepsPromise
}
