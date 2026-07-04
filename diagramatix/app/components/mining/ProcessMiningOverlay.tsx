"use client";

/**
 * Full-screen DiagramatixMINER experience: plays the amber mining intro, then the
 * console. Rendered as an overlay (not a route), mirroring the Simulator.
 */

import { useState } from "react";
import { DiagramatixMinerIntro } from "./DiagramatixMinerIntro";
import { ProcessMiningConsole } from "./ProcessMiningConsole";

export function ProcessMiningOverlay({ projectId, projectName, isAdmin, skipIntro, onClose, onOpenSimulator }: { projectId: string; projectName?: string; isAdmin?: boolean; skipIntro?: boolean; onClose: () => void; onOpenSimulator?: () => void }) {
  const [entered, setEntered] = useState(!!skipIntro);
  return entered
    ? <ProcessMiningConsole projectId={projectId} projectName={projectName} isAdmin={isAdmin} onClose={onClose} onOpenSimulator={onOpenSimulator} />
    : <DiagramatixMinerIntro onEnter={() => setEntered(true)} />;
}
