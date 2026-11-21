"use client";

import { useEffect } from "react";

/** Registers /sw.js once per page load. Silent no-op where service workers aren't available. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
