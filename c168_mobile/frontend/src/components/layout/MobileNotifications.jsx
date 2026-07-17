import { useEffect, useState } from "react";
import AnnouncementUpdateCard from "../announcements/AnnouncementUpdateCard.jsx";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { fetchJson } from "../../lib/fetchJson.js";
import "./mobile-notifications.css";

export async function fetchMobileAnnouncements(signal) {
  const { res, json } = await fetchJson(
    buildApiUrl("api/announcements/announcement_get_dashboard_api.php"),
    { signal },
  );
  if (!res.ok || !json?.success) return [];
  return Array.isArray(json.data) ? json.data : [];
}

export default function MobileNotifications({ open, onClose, i18n, items = [], loading }) {
  const [active, setActive] = useState(null);
  useOverlayLock(open, onClose);

  useEffect(() => {
    if (!open) setActive(null);
  }, [open]);

  const panelTitle = i18n?.announcements || i18n?.notifications || "Announcements";
  const emptyText = i18n?.noAnnouncements || i18n?.noNotifications || "No announcements";
  const cardLabels = {
    updateIncludes: i18n?.updateIncludes,
    versionUpdated: i18n?.versionUpdated,
    teamName: i18n?.announcementTeam,
  };

  return (
    <div
      className={`m-notify-overlay ${open ? "m-notify-overlay--open" : "m-notify-overlay--closed"}`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button
        type="button"
        aria-label={i18n?.dismissMenu || "Dismiss announcements"}
        onClick={onClose}
        className="m-notify-backdrop"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={panelTitle}
        className={`m-notify-panel ${open ? "m-notify-panel--open" : "m-notify-panel--closed"}`}
      >
        <div className="m-notify-handle-wrap" aria-hidden="true">
          <span className="m-notify-handle" />
        </div>

        <div className="m-notify-header">
          <h2 className="m-notify-title">{panelTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="m-notify-close"
            aria-label={i18n?.closeMenu || "Close"}
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="m-notify-list">
          {loading ? (
            <p className="m-notify-empty">{i18n?.loadingAnnouncements || i18n?.loading}</p>
          ) : items.length === 0 ? (
            <p className="m-notify-empty">{emptyText}</p>
          ) : (
            items.map((item) => {
              const isOpen = Number(active) === Number(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(isOpen ? null : item.id)}
                  className="m-notify-item"
                >
                  <AnnouncementUpdateCard announcement={item} labels={cardLabels} collapsed={!isOpen} />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
