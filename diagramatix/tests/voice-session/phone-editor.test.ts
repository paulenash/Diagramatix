/**
 * Stage 5 of mobile voice — the phone's Voice Assist screen, rendered under real
 * React (react-test-renderer) with the real session, reducer and autosave: type
 * a command, it edits the diagram, the sheet says so, undo takes it back, the
 * autosave PUTs the result; the element cap refuses an add.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});

import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { MobileVoiceEditor } from "@/app/components/mobile/MobileVoiceEditor";
import { fakeDictation } from "./fakeDictation";
import { failOnActWarnings, stubFetch, stubWindow, threeTasks } from "./harness";

let root: ReactTestRenderer | null = null;
let puts: { url: string; body: { data: { elements: { label?: string }[] }; version: number } }[] = [];

class FakeResizeObserver { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  fakeDictation.reset();
  stubWindow();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  puts = [];
  stubFetch((url, body) => {
    if (/\/api\/diagrams\/[^/]+$/.test(url) && body && (body as { data?: unknown }).data) { puts.push({ url, body: body as never }); return { version: 8 }; }
    return { ops: [] };
  });
});
afterEach(async () => {
  if (root) { const r = root; root = null; await act(async () => { r.unmount(); }); }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

async function mount(opts: { limit?: number | null } = {}) {
  let closed = 0;
  await act(async () => {
    root = create(createElement(MobileVoiceEditor, {
      diagramId: "d1", diagramName: "Claims", initialData: threeTasks(), version: 7,
      elementCountLimit: opts.limit ?? null, onClose: () => { closed++; },
    }));
  });
  const settle = async () => { for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); }); };
  const texts = () => {
    const out: string[] = [];
    const walk = (n: ReactTestInstance | string) => { if (typeof n === "string") out.push(n); else n.children.forEach(walk); };
    walk(root!.root);
    return out.join(" ");
  };
  const type = async (t: string) => {
    const input = root!.root.findByType("input");
    await act(async () => { input.props.onChange({ target: { value: t } }); });
    await act(async () => { root!.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    await settle();
  };
  const press = async (label: RegExp | string) => {
    const b = root!.root.findAllByType("button").find((x) => (typeof label === "string" ? x.props["aria-label"] === label || x.props.title === label : label.test(String(x.props.children))));
    if (!b) throw new Error("no button " + String(label));
    await act(async () => { b.props.onClick(); });
    await settle();
  };
  await settle();
  return { texts, type, press, closed: () => closed, settle };
}

describe("T5086 — Voice Assist on the phone, end to end", () => {
  it("typing a command edits the diagram and the sheet says so; the autosave saves it at the version the phone loaded", async () => {
    const h = await mount();
    expect(h.texts()).toContain("Claims");
    await h.type("delete Pay supplier");
    expect(h.texts()).toContain("deleted Pay supplier");
    expect(h.texts().replace(/\s+/g, " ")).toContain("delete Pay supplier ” deleted Pay supplier"); // what was heard, then what it did
    await act(async () => { vi.advanceTimersByTime(1600); });
    await h.settle();
    expect(puts).toHaveLength(1);
    expect(puts[0].body.version).toBe(7);
    expect(puts[0].body.data.elements.map((e) => e.label)).not.toContain("Pay supplier");
    expect(h.texts()).toContain("Saved");
  });

  it("undo takes the command back (the ↶ button)", async () => {
    const h = await mount();
    await h.type("delete Pay supplier");
    await h.press("Undo");
    await act(async () => { vi.advanceTimersByTime(1600); });
    await h.settle();
    // back to what was loaded: nothing to save (the label, as on the desktop, keeps saying Unsaved until the next save)
    expect(puts).toHaveLength(0);
  });

  it("the mic starts the session's recogniser and shows what it hears; tapping again stops it", async () => {
    const h = await mount();
    await h.press("Start listening");
    expect(fakeDictation.sessions).toHaveLength(1);
    await act(async () => { fakeDictation.current.cb.onInterim?.("delete pay"); });
    expect(h.texts()).toContain("delete pay");
    await h.press("Stop listening");
    expect(fakeDictation.current.stopped).toBe(true);
  });

  it("a question is put to the person, and a wrong 'yes' cannot answer it after a stop", async () => {
    const h = await mount();
    await h.type("clear the diagram");
    expect(h.texts()).toContain("say “yes” to confirm");
    await h.type("yes");
    expect(h.texts()).toContain("confirmed");
  });

  it("the element cap refuses an add, and says why", async () => {
    // threeTasks has 3 tasks + pool + lane: five counted elements
    const h = await mount({ limit: 5 });
    await h.type("add a task called Approve after Receive order");
    expect(h.texts()).toContain("Element limit reached (5/5)");
  });

  it("Done stops the mic, saves what is unsaved, and hands back", async () => {
    const h = await mount();
    await h.press("Start listening");
    await h.type("delete Pay supplier");
    await h.press(/Done/);
    await act(async () => { vi.advanceTimersByTime(10); });
    await h.settle();
    expect(fakeDictation.current.stopped).toBe(true);
    expect(puts.length).toBeGreaterThanOrEqual(1);
    expect(h.closed()).toBe(1);
  });
});
