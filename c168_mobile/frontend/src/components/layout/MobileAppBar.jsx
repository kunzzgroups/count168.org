import { brandLogoUrl, onBrandLogoError } from "../../lib/brandAssets.js";

export default function MobileAppBar({
  i18n,
  onOpenSidebar,
  onOpenNotifications,
  notificationCount = 0,
}) {
  const count = Number(notificationCount) || 0;

  return (
    <header
      className="relative z-20 shrink-0 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl"
      style={{ paddingTop: "max(6px, env(safe-area-inset-top, 0px))" }}
    >
      <div className="mx-auto grid h-12 max-w-lg grid-cols-[44px_1fr_44px] items-center px-2.5">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="tap-scale grid size-11 place-items-center rounded-xl text-slate-700"
          aria-label={i18n?.openMenu || "Open menu"}
        >
          <i className="fas fa-bars text-[18px]" aria-hidden="true" />
        </button>

        <div className="flex min-w-0 items-center justify-center">
          <img
            src={brandLogoUrl()}
            alt="EazyCount"
            className="h-7 max-w-[148px] object-contain"
            draggable={false}
            data-logo-idx="0"
            onError={onBrandLogoError}
          />
        </div>

        <button
          type="button"
          onClick={onOpenNotifications}
          className="tap-scale relative grid size-11 place-items-center rounded-xl text-slate-700"
          aria-label={i18n?.notifications || "Notifications"}
        >
          <i className="fas fa-bell text-[18px]" aria-hidden="true" />
          {count > 0 ? (
            <span className="absolute right-1.5 top-1.5 grid min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-4 text-white">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </button>
      </div>
    </header>
  );
}
