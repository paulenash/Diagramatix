"use client";

import { useEffect, useState } from "react";

/**
 * Whether to offer "Create a New Value Chain" to this user — asked of the server (GET /api/repository/new-chain/access), which applies the
 * same checks the create routes enforce (Feature Availability, the Expert floor, the Org's AI and role switches). The answer is fetched once
 * per page load; until it arrives nothing is shown.
 */
export function useNewChainAccess(): { allowed: boolean; reason?: string } {
  const [state, setState] = useState<{ allowed: boolean; reason?: string }>({ allowed: false });
  useEffect(() => {
    let live = true;
    fetch("/api/repository/new-chain/access")
      .then((r) => r.json())
      .then((j: { allowed?: boolean; reason?: string }) => { if (live) setState({ allowed: j.allowed === true, reason: j.reason }); })
      .catch(() => { /* not offered if we cannot tell */ });
    return () => { live = false; };
  }, []);
  return state;
}
