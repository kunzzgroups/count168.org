import { useEffect, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { fetchJson } from "../../lib/fetchJson.js";

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

  return (
    <div
      className={`fixed inset-0 z-[70] transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <button
        type="button"
        aria-label={i18n?.dismissMenu || "Dismiss notifications"}
        onClick={onClose}
        className="absolute inset-0 size-full border-0 bg-slate-900/35 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n?.notifications || "Notifications"}
        className={`absolute inset-x-0 bottom-0 flex max-h-[78%] flex-col rounded-t-3xl bg-white shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-3" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 pb-2 pt-2">
          <h2 className="text-[18px] font-bold text-slate-900">{i18n?.notifications || "Notifications"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500"
            aria-label={i18n?.closeMenu || "Close"}
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div
          className="flex-1 space-y-2 overflow-y-auto px-4 pb-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          {loading ? (
            <p className="py-10 text-center text-[13px] font-semibold text-slate-400">{i18n?.loading}</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-[13px] font-semibold text-slate-400">
              {i18n?.noNotifications || "No notifications"}
            </p>
          ) : (
            items.map((item) => {
              const isOpen = Number(active) === Number(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(isOpen ? null : item.id)}
                  className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left ring-1 ring-slate-100"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-[#2f6bf6]">
                      <i className="fas fa-bullhorn text-[12px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-slate-900">{item.title || "—"}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-400">{item.created_at}</p>
                      {isOpen ? (
                        <p className="mt-2 whitespace-pre-wrap text-[13px] font-medium leading-relaxed text-slate-600">
                          {item.content}
                        </p>
                      ) : (
                        <p className="mt-1 line-clamp-2 text-[12px] font-medium text-slate-500">
                          {item.content}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
