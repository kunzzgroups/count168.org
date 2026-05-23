import { summaryNotificationCssType } from "../lib/summaryNotificationNormalize.js";

export default function SummaryNotification({ notification, shown, onClose }) {
  const { open, title, message, type } = notification;
  const typeClass = summaryNotificationCssType(type);

  if (!open) return null;

  return (
    <div
      id="notificationPopup"
      className={`notification-popup ${typeClass}${shown ? " show" : ""}`}
      style={{ display: "block" }}
      role="status"
      aria-live="polite"
    >
      <div className="notification-header">
        <span className="notification-title" id="notificationTitle">
          {title}
        </span>
        <button type="button" className="notification-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>
      <div className="notification-message" id="notificationMessage">
        {message}
      </div>
    </div>
  );
}
