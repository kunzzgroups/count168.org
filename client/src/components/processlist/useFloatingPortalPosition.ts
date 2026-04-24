import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'

type FloatingPos = {
  top: number
  left: number
  minWidth: number
}

type Options = {
  gap?: number
  viewportPadding?: number
  preferredMinWidth?: number
}

export function useFloatingPortalPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  options: Options = {},
) {
  const { gap = 6, viewportPadding = 8, preferredMinWidth = 120 } = options
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)
  const [pos, setPos] = useState<FloatingPos>({ top: 0, left: 0, minWidth: preferredMinWidth })

  const recompute = useCallback(() => {
    const anchor = anchorRef.current
    if (!open || !anchor) return

    const ar = anchor.getBoundingClientRect()
    const mw = menuEl?.offsetWidth ?? preferredMinWidth
    const mh = menuEl?.offsetHeight ?? 0
    const vpW = window.innerWidth
    const vpH = window.innerHeight

    const minWidth = Math.max(preferredMinWidth, Math.round(ar.width))

    let left = ar.left
    if (left + mw > vpW - viewportPadding) left = vpW - viewportPadding - mw
    if (left < viewportPadding) left = viewportPadding

    const roomBelow = vpH - ar.bottom - viewportPadding
    const roomAbove = ar.top - viewportPadding
    const useAbove = mh > 0 && roomBelow < mh && roomAbove > roomBelow

    const top = useAbove ? Math.max(viewportPadding, ar.top - mh - gap) : ar.bottom + gap

    setPos({
      top: Math.round(top),
      left: Math.round(left),
      minWidth,
    })
  }, [anchorRef, gap, menuEl, open, preferredMinWidth, viewportPadding])

  useLayoutEffect(() => {
    if (!open) return
    recompute()
    const onMove = () => recompute()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, recompute])

  return {
    pos,
    setMenuEl,
    recompute,
  }
}

