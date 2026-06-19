"use client";

/**
 * Full-screen Simulator experience: plays the Matrix intro, then the console.
 * Rendered as an overlay (not a route) so the underlying diagram stays loaded.
 */

import { useState } from "react";
import { SimulatorIntro } from "./SimulatorIntro";
import { SimulatorConsole } from "./SimulatorConsole";

export function SimulatorOverlay({ diagramName, onClose }: { diagramName?: string; onClose: () => void }) {
  const [entered, setEntered] = useState(false);
  return entered ? (
    <SimulatorConsole diagramName={diagramName} onClose={onClose} />
  ) : (
    <SimulatorIntro onEnter={() => setEntered(true)} />
  );
}
