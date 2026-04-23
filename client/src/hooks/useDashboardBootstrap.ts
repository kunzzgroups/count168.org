import { useCallback, useEffect, useState } from 'react'
import { fetchDashboardBootstrap } from '../lib/fetchDashboardBootstrap'
import type { DashboardBootstrapData } from '../types/dashboard'
import type { FetchDashboardBootstrapResult } from '../lib/fetchDashboardBootstrap'

type Gate = 'loading' | 'ready' | 'error'

let bootstrapCache: DashboardBootstrapData | null = null
let inFlightBootstrap: Promise<FetchDashboardBootstrapResult> | null = null

/**
 * 拉取并缓存 Dashboard 壳所需会话数据；需整页走的场景会自行 `location.assign`。
 * 同一会话内在 `/dashboard` ↔ `/transaction` 等路由间切换时复用缓存，避免重复全屏 loading。
 */
export function useDashboardBootstrap() {
  const [gate, setGate] = useState<Gate>(() =>
    bootstrapCache ? 'ready' : 'loading',
  )
  const [data, setData] = useState<DashboardBootstrapData | null>(
    () => bootstrapCache,
  )
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => {
    bootstrapCache = null
    inFlightBootstrap = null
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let alive = true

    const apply = (r: FetchDashboardBootstrapResult) => {
      if (!alive) return
      if (r.kind === 'redirect') {
        window.location.assign(r.url)
        return
      }
      if (r.kind === 'fail') {
        if (bootstrapCache) {
          setData(bootstrapCache)
          setGate('ready')
          return
        }
        setData(null)
        setGate('error')
        return
      }
      bootstrapCache = r.data
      setData(r.data)
      setGate('ready')
    }

    const hadCache = bootstrapCache != null
    if (!hadCache) {
      setGate('loading')
    }

    let p = inFlightBootstrap
    if (!p) {
      p = fetchDashboardBootstrap()
      inFlightBootstrap = p
      p.finally(() => {
        if (inFlightBootstrap === p) inFlightBootstrap = null
      })
    }

    void p.then((r) => {
      if (!alive) return
      apply(r)
    })

    return () => {
      alive = false
    }
  }, [tick])

  return { gate, data, refetch }
}
