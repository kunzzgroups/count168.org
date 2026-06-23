import { useEffect, useRef, useState } from "react";
import { ensureMaintenanceDateRangePicker } from "../../utils/date/dateRangePicker.js";
import { formatDmyFromDate } from "../maintenance/shared/maintenanceDateHelpers.js";

function mondayDmyForDate(d) {
  const day = d.getDay();
  const toMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - toMonday);
  return formatDmyFromDate(monday);
}

function parseDmyToDate(dmy) {
  const match = String(dmy || "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const dt = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/** Roll stale "today" / "this week" ranges forward when the calendar day changes. */
function bumpStaleRange(dateFrom, dateTo, prevTodayDmy, nextTodayDmy) {
  if (!dateTo || dateTo !== prevTodayDmy || nextTodayDmy === prevTodayDmy) {
    return null;
  }
  if (dateFrom === prevTodayDmy) {
    return { from: nextTodayDmy, to: nextTodayDmy };
  }
  const prevDate = parseDmyToDate(prevTodayDmy);
  if (prevDate && dateFrom === mondayDmyForDate(prevDate)) {
    return { from: mondayDmyForDate(new Date()), to: nextTodayDmy };
  }
  return { from: dateFrom, to: nextTodayDmy };
}

/**
 * Keep member Win/Loss #date_from/#date_to aligned with React state (MaintenanceDateRangePicker writes DOM).
 */
export function useMemberDateRange({
  ready,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
}) {
  const [todayDmy, setTodayDmy] = useState(() => formatDmyFromDate(new Date()));
  const pickerReadyRef = useRef(false);
  const todayDmyRef = useRef(todayDmy);
  const dateFromRef = useRef(dateFrom);
  const dateToRef = useRef(dateTo);

  todayDmyRef.current = todayDmy;
  dateFromRef.current = dateFrom;
  dateToRef.current = dateTo;

  useEffect(() => {
    if (!ready) return;
    const df = document.getElementById("date_from");
    const dt = document.getElementById("date_to");
    if (!df || !dt) return;
    const f = dateFrom || todayDmy;
    const t = dateTo || todayDmy;
    if (df.value !== f) df.value = f;
    if (dt.value !== t) dt.value = t;
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.();
  }, [ready, dateFrom, dateTo, todayDmy]);

  useEffect(() => {
    if (!ready) return undefined;

    let cancelled = false;

    const initPicker = () => {
      if (cancelled || pickerReadyRef.current) return;
      if (!window.MaintenanceDateRangePicker?.init) return;
      if (!document.getElementById("calendar-popup")) return;

      window.MaintenanceDateRangePicker.init({
        allowEmpty: false,
        onChange: () => {
          const from = document.getElementById("date_from")?.value?.trim() || "";
          const to = document.getElementById("date_to")?.value?.trim() || "";
          if (!from || !to) return;
          setDateFrom(from);
          setDateTo(to);
        },
      });
      window.MaintenanceDateRangePicker.refreshInputsDisplay?.();
      pickerReadyRef.current = true;
    };

    ensureMaintenanceDateRangePicker();
    initPicker();

    return () => {
      cancelled = true;
      pickerReadyRef.current = false;
    };
  }, [ready, setDateFrom, setDateTo]);

  useEffect(() => {
    if (!ready) return undefined;

    const refreshToday = () => {
      if (document.visibilityState === "hidden") return;
      const nextTodayDmy = formatDmyFromDate(new Date());
      const prevTodayDmy = todayDmyRef.current;
      if (nextTodayDmy === prevTodayDmy) return;

      setTodayDmy(nextTodayDmy);

      const bumped = bumpStaleRange(
        dateFromRef.current,
        dateToRef.current,
        prevTodayDmy,
        nextTodayDmy,
      );
      if (bumped) {
        setDateFrom(bumped.from);
        setDateTo(bumped.to);
      }
    };

    document.addEventListener("visibilitychange", refreshToday);
    window.addEventListener("focus", refreshToday);
    return () => {
      document.removeEventListener("visibilitychange", refreshToday);
      window.removeEventListener("focus", refreshToday);
    };
  }, [ready, setDateFrom, setDateTo]);

  return { todayDmy };
}
