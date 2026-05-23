import { useEffect, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  DATA_CAPTURE_HOME_PATH,
  resolveCompanyGamesAccess,
} from "../../datacapture/lib/dataCaptureCompanyAccess.js";
import { consumeSummaryFreshNavigation } from "../lib/summaryStorage.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { usePartnershipAuditReadOnlyLocked } from "../../../utils/audit/partnershipAuditReadOnly.js";

/**
 * Session boot for Summary SPA — reuses AuthenticatedLayout session (no duplicate API).
 */
export function useSummaryBoot() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();

  const mutationsBlocked = usePartnershipAuditReadOnlyLocked(me);
  const companyId =
    me?.company_id != null && Number.isFinite(Number(me.company_id)) ? Number(me.company_id) : null;

  useEffect(() => {
    if (!sessionReady || !me || companyId == null) return;

    const freshNav =
      consumeSummaryFreshNavigation() ||
      window.isNavigatingAwayByBackOrSubmit ||
      new URLSearchParams(window.location.search).get("success") === "1";

    if (freshNav) {
      window.isNavigatingAwayByBackOrSubmit = false;
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const companyCode =
        me.company_code != null && String(me.company_code).trim() !== ""
          ? String(me.company_code).trim()
          : String(companyId);

      const allowed = await resolveCompanyGamesAccess({
        companyId,
        companyCode,
        sessionUser: me,
      });
      if (!cancelled && !allowed) {
        navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, companyId, sessionReady, navigate]);

  useLayoutEffect(() => {
    window.DATACAPTURESUMMARY_COMPANY_ID = companyId;
    return () => {
      window.DATACAPTURESUMMARY_COMPANY_ID = null;
    };
  }, [companyId]);

  return {
    me,
    companyId,
    mutationsBlocked,
    bootLoading: !sessionReady,
    bootError: sessionReady && !me,
  };
}
