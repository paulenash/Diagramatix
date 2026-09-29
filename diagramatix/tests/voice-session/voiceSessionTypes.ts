/**
 * The shape of the voice session hook, for the behaviour tests — loose on
 * purpose: the tests read what the hook returns; the hook's own types are
 * checked where it is used (DiagramEditor.tsx after the move).
 */
import type { CommandLogEntry } from "@/app/components/canvas/VoiceAssistBar";

export interface VoiceSession {
  voiceAssistOn: boolean;
  setVoiceAssistOn: (on: boolean) => void;
  voiceLog: CommandLogEntry[];
  voiceListening: boolean;
  abraConnecting: boolean;
  abraEngine: "deepgram" | "browser" | null;
  voiceInterim: string;
  voiceBusy: boolean;
  runVoiceCommand: (text: string, fromQueue?: boolean) => Promise<void>;
  toggleAbraListening: () => Promise<void>;
  stopAbraListening: () => void;
  appendLog: (entry: Omit<CommandLogEntry, "id" | "at">) => void;
  clearVoiceLog: () => void;
  voiceDebugRecording: boolean;
  setVoiceDebugRecording: (on: boolean) => void;
  goldFlash: { runId: number; targets: unknown[] };
  renameFlow: unknown;
  messageFlow: unknown;
  pickFlow: unknown;
  dividerFlow: unknown;
  templateFlow: unknown;
  pendingConfirmRef: { current: unknown };
  voiceQueueRef: { current: string[] };
  voiceBusyRef: { current: boolean };
  voiceLastId: { current: string | null };
  [k: string]: unknown;
}

export declare function useVoiceSession(host: Record<string, unknown>): VoiceSession;
