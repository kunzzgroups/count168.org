import type { CSSProperties } from 'react'

type Item = { id: number; content: string }

type MaintenanceMarqueeProps = {
  items: Item[]
}

/**
 * 对应 `index.php` 中
 * `#maintenanceMarqueeWrapper` + `.maintenance-marquee-wrapper` + `.maintenance-marquee-track`
 */
export function MaintenanceMarquee({ items }: MaintenanceMarqueeProps) {
  const has = items.length > 0
  const showStyle: CSSProperties = { display: has ? undefined : 'none' }
  return (
    <div
      className="maintenance-marquee-wrapper"
      id="maintenanceMarqueeWrapper"
      style={showStyle}
    >
      <div className="maintenance-marquee-track" id="maintenanceMarqueeTrack">
        {has &&
          [...items, ...items].map((m, i) => (
            <div
              className="maintenance-marquee-item"
              key={`${m.id}-${i}`}
            >
              <span className="maintenance-marquee-dot" />
              <span className="maintenance-marquee-label">系统维护中:</span>
              <span>{m.content}</span>
            </div>
          ))}
      </div>
    </div>
  )
}
