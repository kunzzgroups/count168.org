/**
 * Shows a Data Capture toast. Uses React host when available (`__DC_PUSH_NOTIFICATION__`),
 * otherwise falls back to the same DOM behavior as `showNotification` in `js/datacapture.js`.
 */
export function pushDataCaptureNotification(message, type = "success") {
  if (typeof window.__DC_PUSH_NOTIFICATION__ === "function") {
    window.__DC_PUSH_NOTIFICATION__(message, type);
    return;
  }

  const container = document.getElementById("processNotificationContainer");
  if (!container) {
    console.error("Notification container not found");
    window.alert(message);
    return;
  }

  const existingNotifications = container.querySelectorAll(".process-notification");
  if (existingNotifications.length >= 2) {
    const oldestNotification = existingNotifications[0];
    oldestNotification.classList.remove("show");
    setTimeout(() => {
      if (oldestNotification.parentNode) {
        oldestNotification.remove();
      }
    }, 300);
  }

  const notification = document.createElement("div");
  notification.className = `process-notification process-notification-${type}`;
  notification.textContent = message;
  container.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, 1500);
}
