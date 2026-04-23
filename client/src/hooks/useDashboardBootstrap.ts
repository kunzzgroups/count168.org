import { useCallback, useEffect, useState } from 'react'
import { fetchDashboardBootstrap } from '../lib/fetchDashboardBootstrap'
import type { DashboardBootstrapData } from '../types/dashboard'

type Gate = 'loading' | 'ready' | 'error'

/**
 * 拉取并缓存 Dashboard 壳所需会话数据；需整页走的场景会自行 `location.assign`。
 */
export function useDashboardBootstrap() {
  const [gate, setGate] = useState<Gate>('loading')
  const [data, setData] = useState<DashboardBootstrapData | null>(null)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let alive = true
    setGate('loading')
    ;(async () => {
      const r = await fetchDashboardBootstrap()
      if (!alive) return
      if (r.kind === 'redirect') {
        window.location.assign(r.url)
        return
      }
      if (r.kind === 'fail') {
        setData(null)
        setGate('error')
        return
      }
      setData(r.data)
      setGate('ready')
    })()
    return () => {
      alive = false
    }
  }, [tick])

  return { gate, data, refetch }
}
