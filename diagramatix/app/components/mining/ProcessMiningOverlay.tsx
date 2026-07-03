"use client";

/**
 * Full-screen DiagramatixMINER experience: plays the amber mining intro, then the
 * console. Rendered as an overlay (not a route), mirroring the Simulator.
 */

import { useState } from "react";
import { DiagramatixMinerIntro } from "./DiagramatixMinerIntro";
import { ProcessMiningConsole } from "./ProcessMiningConsole";

export function ProcessMiningOverlay({ projectId, projectName, onClose, onOpenSimulator }: { projectId: string; projectName?: string; onClose: () => void; onOpenSimulator?: () => void }) {
  const [entered, setEntered] = useState(false);
  return entered
    ? <ProcessMiningConsole projectId={projectId} projectName={projectName} onClose={onClose} onOpenSimulator={onOpenSimulator} />
    : <DiagramatixMinerIntro onEnter={() => setEntered(true)} />;
}
