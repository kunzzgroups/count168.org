import { useOptionalAuthSession } from "../context/AuthSessionContext.jsx";

/** In-layout page boot placeholder — keeps sidebar visible while route data loads. */
export default function PageContentLoader({ label }) {
  const session = useOptionalAuthSession();
  const lang = session?.lang;
  const text = label ?? (lang === "zh" ? "正在加载…" : "Loading…");

  return (
    <div className="ec-page-content-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="ec-page-content-loader__spinner" aria-hidden="true" />
      <span className="ec-page-content-loader__label">{text}</span>
    </div>
  );
}
