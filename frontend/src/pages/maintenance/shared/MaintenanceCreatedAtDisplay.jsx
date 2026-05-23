import { parseMaintenanceDateTime } from "./maintenanceCreatedAtDisplay.js";

/**
 * Created At column: date on top, time in parentheses below (transaction maintenance style).
 * @param {{ value?: string | null, fallback?: string }} props
 */
export default function MaintenanceCreatedAtDisplay({ value, fallback = "-" }) {
  const parsed = parseMaintenanceDateTime(value);
  if (!parsed) return fallback;

  const { date, time } = parsed;
  const title = time ? `${date} ${time}` : date;

  return (
    <span className="maintenance-created-at-display" title={title}>
      <span className="maintenance-created-at-date">{date}</span>
      {time ? <span className="maintenance-created-at-time">({time})</span> : null}
    </span>
  );
}
