"use client";

/**
 * Whether the Matrix-rain "screensaver" cascade is currently running. The three
 * floating controls (Matrix toggle, camera, video) hide while it's on so the
 * cascade fills the screen cleanly. MatrixToggle broadcasts the state on a window
 * event + a window flag (so a listener that mounts mid-cascade still reads it).
 */
import { useEffect, useState } from "react";

export const MATRIX_RUNNING_EVENT = "diagramatix.matrix.running";

export function useMatrixRunning(): boolean {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    setRunning(!!(window as unknown as { __dgxMatrixRunning?: boolean }).__dgxMatrixRunning);
    const onEvt = (e: Event) => setRunning(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(MATRIX_RUNNING_EVENT, onEvt);
    return () => window.removeEventListener(MATRIX_RUNNING_EVENT, onEvt);
  }, []);
  return running;
}
