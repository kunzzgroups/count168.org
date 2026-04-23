import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

type Props = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  dateFrom: string
  dateTo: string
  onClose: () => void
  onCommit: (from: string, to: string) => void
  /**
   * `transaction`：与 `transaction_classic.php` + `js/date-range-picker.js` 一致
   *（#calendar-popup、#calendar-days、宽度随 Capture Date 父级）。
   */
  variant?: 'spa' | 'transaction'
}

/**
 * 与 `js/dashboard.js` 日历弹窗行为一致：两次点击定范围，选满后提交并关闭。
 * 由父级在 `open` 变化时更新 `key` 以同步初始选中区间。
 */
export function DashboardCalendarPopup({
  open,
  anchorRef,
  dateFrom,
  dateTo,
  onClose,
  onCommit,
  variant = 'spa',
}: Props) {
  const [viewYear, setViewYear] = useState(() => parseYmd(dateFrom).getFullYear())
  const [viewMonth, setViewMonth] = useState(() => parseYmd(dateFrom).getMonth())
  const [selStart, setSelStart] = useState<Date | null>(() => {
    const a = parseYmd(dateFrom)
    a.setHours(0, 0, 0, 0)
    return a
  })
  const [selEnd, setSelEnd] = useState<Date | null>(() => {
    const b = parseYmd(dateTo)
    b.setHours(0, 0, 0, 0)
    return b
  })
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [posStyle, setPosStyle] = useState<CSSProperties>({
    display: 'none',
    top: 0,
    left: 0,
  })

  const popupDomId = variant === 'transaction' ? 'calendar-popup' : 'react-dashboard-calendar-popup'

  useLayoutEffect(() => {
    const next: CSSProperties = !open
      ? { display: 'none', top: 0, left: 0 }
      : (() => {
          const el = anchorRef.current
          if (!el) return { display: 'none', top: 0, left: 0 }
          const r = el.getBoundingClientRect()
          const parent = el.parentElement
          let width: string | undefined
          if (
            variant === 'transaction' &&
            parent?.classList.contains('transaction-date-range-group')
          ) {
            width = `${parent.getBoundingClientRect().width}px`
          }
          return {
            display: 'block',
            top: r.bottom + 8,
            left: r.left,
            ...(width ? { width, boxSizing: 'border-box' as const } : {}),
          }
        })()
    setPosStyle(next)
  }, [open, anchorRef, variant])

  useLayoutEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      const pop = document.getElementById(popupDomId)
      if (pop?.contains(t)) return
      onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, anchorRef, onClose, popupDomId])

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    const out: number[] = []
    for (let i = 2022; i <= y + 1; i++) out.push(i)
    return out
  }, [])

  const grid = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const lastDay = new Date(viewYear, viewMonth + 1, 0)
    const prevLast = new Date(viewYear, viewMonth, 0)
    const firstDayWeek = firstDay.getDay()
    const lastDate = lastDay.getDate()
    const prevLastDate = prevLast.getDate()
    const days: {
      day: number
      y: number
      m: number
      other: boolean
    }[] = []
    for (let i = firstDayWeek - 1; i >= 0; i--) {
      days.push({
        day: prevLastDate - i,
        y: viewYear,
        m: viewMonth - 1,
        other: true,
      })
    }
    for (let d = 1; d <= lastDate; d++) {
      days.push({ day: d, y: viewYear, m: viewMonth, other: false })
    }
    const totalCells = days.length
    const remainingCells =
      totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
    for (let d = 1; d <= remainingCells; d++) {
      days.push({ day: d, y: viewYear, m: viewMonth + 1, other: true })
    }
    return days
  }, [viewYear, viewMonth])

  const onDayClick = useCallback(
    (y: number, m: number, d: number) => {
      const picked = new Date(y, m, d)
      picked.setHours(0, 0, 0, 0)
      if (!selStart || selEnd) {
        setSelStart(picked)
        setSelEnd(null)
        return
      }
      let a = selStart
      let b = picked
      if (picked < selStart) {
        a = picked
        b = selStart
      }
      onCommit(toYmd(a), toYmd(b))
      onClose()
    },
    [selStart, selEnd, onCommit, onClose],
  )

  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])

  const previewEnd =
    selStart && !selEnd && hoverDate ? hoverDate : selEnd

  if (!open) return null

  return (
    <div
      id={popupDomId}
      className="calendar-popup"
      style={posStyle}
      role="dialog"
      aria-label="Date range"
    >
      <div className="calendar-header">
        <button
          type="button"
          className="calendar-nav-btn"
          onClick={(e) => {
            e.stopPropagation()
            const d = new Date(viewYear, viewMonth - 1, 1)
            setViewYear(d.getFullYear())
            setViewMonth(d.getMonth())
          }}
        >
          <i className="fas fa-chevron-left" />
        </button>
        <div className="calendar-month-year" onClick={(e) => e.stopPropagation()}>
          <select
            id="calendar-month-select"
            value={viewMonth}
            onChange={(e) => setViewMonth(Number(e.target.value))}
          >
            {[
              'Jan',
              'Feb',
              'Mar',
              'Apr',
              'May',
              'Jun',
              'Jul',
              'Aug',
              'Sep',
              'Oct',
              'Nov',
              'Dec',
            ].map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <select
            id="calendar-year-select"
            value={viewYear}
            onChange={(e) => setViewYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="calendar-nav-btn"
          onClick={(e) => {
            e.stopPropagation()
            const d = new Date(viewYear, viewMonth + 1, 1)
            setViewYear(d.getFullYear())
            setViewMonth(d.getMonth())
          }}
        >
          <i className="fas fa-chevron-right" />
        </button>
      </div>
      <div className="calendar-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="calendar-weekday">
            {d}
          </div>
        ))}
      </div>
      <div className="calendar-days" id={variant === 'transaction' ? 'calendar-days' : undefined}>
        {grid.map((cell, idx) => {
          const dt = new Date(cell.y, cell.m, cell.day)
          dt.setHours(0, 0, 0, 0)
          const t0 = dt.getTime()
          const cls = ['calendar-day']
          if (cell.other) cls.push('other-month')
          if (!cell.other && t0 === today.getTime()) cls.push('today')
          if (selStart) {
            const st = selStart.getTime()
            const en = previewEnd ? previewEnd.getTime() : st
            const lo = Math.min(st, en)
            const hi = Math.max(st, en)
            if (previewEnd && t0 === lo && t0 === hi) {
              cls.push('selected', 'start-date', 'end-date')
            } else if (t0 === st && !previewEnd) {
              cls.push('start-date', 'selecting')
            } else if (previewEnd && t0 === lo) cls.push('start-date')
            else if (previewEnd && t0 === hi) cls.push('end-date')
            else if (previewEnd && t0 > lo && t0 < hi) cls.push('in-range')
          }
          return (
            <div
              key={idx}
              className={cls.join(' ')}
              role="button"
              tabIndex={0}
              onMouseEnter={() => {
                if (selStart && !selEnd) setHoverDate(dt)
              }}
              onMouseLeave={() => setHoverDate(null)}
              onClick={(e) => {
                e.stopPropagation()
                onDayClick(cell.y, cell.m, cell.day)
              }}
            >
              {cell.day}
            </div>
          )
        })}
      </div>
    </div>
  )
}
