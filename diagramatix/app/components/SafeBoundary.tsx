"use client";

import { Component, type ReactNode } from "react";

interface Props {
  /** What failed, in the user's words — "The SharePoint window". */
  what: string;
  /** Dismiss the failed window. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * Contains a render failure inside a pop-up window of the editor, so the
 * window fails and the diagram does not. The app has no other error boundary:
 * without this, one bad response rendered inside the SharePoint picker
 * replaced the whole editor with Next's error page (Paul, 2026-09-22: it "can
 * kill the app").
 */
export class SafeBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.error(`[SafeBoundary] ${this.props.what} failed:`, err);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[80]">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5 text-center">
          <p className="text-sm text-gray-800 mb-1">{this.props.what} ran into a problem.</p>
          <p className="text-xs text-gray-500 mb-4">Your diagram is untouched. Close this and try again.</p>
          <button
            onClick={() => { this.setState({ failed: false }); this.props.onClose(); }}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    );
  }
}
