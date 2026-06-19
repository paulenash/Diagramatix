"use client";

/**
 * Full-screen Simulator experience: plays the Matrix intro, then the console.
 * Rendered as an overlay (not a route) so the underlying diagram stays loaded.
 */

import { useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { SimulatorIntro } from "./SimulatorIntro";
import { SimulatorConsole } from "./SimulatorConsole";

export function SimulatorOverlay({ data, diagramName, onClose, onFillTestData }: {
  data: DiagramData; diagramName?: string; onClose: () => void; onFillTestData?: () => number;
}) {
  const [entered, setEntered] = useState(false);
  return entered ? (
    <SimulatorConsole data={data} diagramName={diagramName} onClose={onClose} onFillTestData={onFillTestData} />
  ) : (
    <SimulatorIntro onEnter={() => setEntered(true)} />
  );
}
