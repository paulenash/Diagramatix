"use client";

import { useState } from "react";

/**
 * Mobile app shell: a compact top bar (app name + account menu) around each /m
 * page. The account menu offers "Desktop version" — sets the dgx-desktop cookie
 * (so the proxy stops auto-redirecting phones to /m) and switches to /dashboard —
 * plus Sign out.
 */
export function MobileChrome({ userName, children }: { userName: string; children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);

  function useDesktop() {
    document.cookie = "dgx-desktop=1; path=/; max-age=31536000";
    window.location.href = "/dashboard?desktop=1";
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-20 bg-blue-900 text-white flex items-center justify-between px-4 h-12 shadow">
        <span className="font-semibold tracking-wide">Diagramatix</span>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} aria-label="Account menu"
            className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-sm font-medium">
            {(userName[0] ?? "?").toUpperCase()}
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 mt-1 w-48 bg-white text-gray-800 rounded-lg shadow-lg z-20 overflow-hidden">
                <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100 truncate">{userName}</div>
                <button onClick={useDesktop} className="block w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50">Desktop version</button>
                <a href="/api/auth/signout" className="block w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50">Sign out</a>
              </div>
            </>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
