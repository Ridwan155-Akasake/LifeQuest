"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type State = "loading" | "unsupported" | "insecure" | "denied" | "off" | "on";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const installed = window.matchMedia("(display-mode: standalone)").matches ? " (app)" : "";
  return `${os} · ${browser}${installed}`;
}

/** Turn push notifications on/off for THIS device, and send a test. */
export function PushSettings({ vapidKey }: { vapidKey: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!window.isSecureContext) return setState("insecure");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      setMsg("");
      try {
        if ((await Notification.requestPermission()) !== "granted") return setState("denied");
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
        const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), device: deviceLabel() }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Server refused the subscription");
        setState("on");
        setMsg("Notifications are on for this device.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Couldn't turn notifications on");
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("Notifications are off for this device.");
      router.refresh();
    });

  const test = () =>
    start(async () => {
      const res = await fetch("/api/push/test", { method: "POST" });
      const { via } = (await res.json().catch(() => ({}))) as { via?: string };
      setMsg(via === "push" ? "Sent. It should pop up in a few seconds." : via === "telegram" ? "No device got it, so it went to Telegram instead." : "Nothing delivered. Turn notifications on, or set up the Telegram fallback.");
    });

  const btn = "rounded-btn px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50";
  return (
    <div className="flex flex-col gap-3">
      {state === "loading" && <p className="text-sm text-fg-faint">Checking this device…</p>}
      {state === "insecure" && <p className="text-sm text-warn">Notifications need HTTPS. They'll work once HQ is live at hq.ridwansharif.com (or on localhost).</p>}
      {state === "unsupported" && <p className="text-sm text-warn">This browser can't receive push notifications. On iPhone, add HQ to the Home Screen first (iOS 16.4+).</p>}
      {state === "denied" && <p className="text-sm text-stop">Notifications are blocked for this site. Allow them in the browser&apos;s site settings, then reload.</p>}
      {!vapidKey && <p className="text-sm text-warn">Server isn&apos;t configured for push yet (VAPID keys missing in .env).</p>}
      <div className="flex flex-wrap gap-2">
        {state === "off" && vapidKey && (
          <button type="button" disabled={pending} onClick={enable} className={`${btn} bg-accent text-base`}>
            Turn on notifications
          </button>
        )}
        {state === "on" && (
          <button type="button" disabled={pending} onClick={disable} className={`${btn} border border-line-strong text-fg-muted hover:text-fg`}>
            Turn off on this device
          </button>
        )}
        <button type="button" disabled={pending} onClick={test} className={`${btn} border border-line-strong text-fg hover:border-accent`}>
          Send test notification
        </button>
      </div>
      {msg && (
        <p aria-live="polite" className="text-sm text-fg-muted">
          {msg}
        </p>
      )}
    </div>
  );
}
