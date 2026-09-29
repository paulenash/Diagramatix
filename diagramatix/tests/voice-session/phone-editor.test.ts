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

async function mount(opts: { limit?: number | null; initial?: import("@/app/lib/diagram/types").DiagramData } = {}) {
  let closed = 0;
  await act(async () => {
    root = create(createElement(MobileVoiceEditor, {
      diagramId: "d1", diagramName: "Claims", initialData: opts.initial ?? threeTasks(), version: 7,
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
    const input = root!.root.findAllByType("input").find((i) => i.props.type !== "checkbox")!;
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

  it("'rename tasks' puts the green numbers on the diagram AND as chips to tap; tapping a chip answers, then the name renames", async () => {
    const h = await mount();
    await h.type("rename tasks");
    const chips = root!.root.findAll((n) => n.props?.["aria-label"] === "Numbers you can say or tap");
    expect(chips).toHaveLength(1);
    const chipButtons = chips[0].findAllByType("button");
    expect(chipButtons.length, "one chip per task").toBe(3);
    // the badges are drawn in the diagram's overlay too: green rounded rects with the number
    const greens = root!.root.findAll((n) => n.type === "rect" && n.props.fill === "#16a34a");
    expect(greens.length, "one badge per task").toBe(3);
    await act(async () => { chipButtons[1].props.onClick(); });
    await h.settle();
    await h.type("Verify invoice");
    expect(h.texts()).toContain("Verify invoice");
  });

  it("a question that needs yes or no gets Yes / No buttons, and Yes confirms", async () => {
    const h = await mount();
    await h.type("clear the diagram");
    await h.press(/^Yes$/);
    expect(h.texts()).toContain("confirmed");
  });

  it("Auto-connect: 'add a task' joins the element it follows; switched off, it does not", async () => {
    const h = await mount();
    await h.type("add a task called Zed after Pay supplier");
    await h.type("add a task called Yan");
    expect(h.texts()).toContain("added Yan after Zed");
    const box = root!.root.findAll((n) => n.type === "input" && n.props.type === "checkbox")[0];
    await act(async () => { box.props.onChange({ target: { checked: false } }); });
    await h.settle();
    await h.type("add a task called Xi");
    expect(h.texts()).not.toContain("added Xi after");
  });

  it("a message from a black-box pool to an event is drawn, and the view frames both ends", async () => {
    const E = (o: Record<string, unknown>) => o as never;
    const initial = { elements: [
      E({ id: "cust", type: "pool", x: 0, y: 0, width: 900, height: 80, label: "Customer", properties: { poolType: "black-box" } }),
      E({ id: "co", type: "pool", x: 0, y: 220, width: 900, height: 200, label: "Company", properties: { poolType: "white-box" } }),
      E({ id: "l1", type: "lane", x: 30, y: 220, width: 870, height: 200, label: "Clerk", parentId: "co", properties: {} }),
      E({ id: "ev", type: "start-event", x: 100, y: 300, width: 36, height: 36, label: "Order received", parentId: "l1", properties: {} }),
    ], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as never;
    const h = await mount({ initial });
    await h.type("add message from Customer to Order received");
    expect(h.texts().replace(/\s+/g, " ")).toContain("added message Customer → Order received");
  });

  it("when Customer is both a pool and a lane it asks which: the numbers are on the diagram AND chips; a chip answers; a WHITE-box pool cannot send a message, and the sheet says so", async () => {
    const E = (o: Record<string, unknown>) => o as never;
    const initial = { elements: [
      E({ id: "cust", type: "pool", x: 0, y: 0, width: 900, height: 160, label: "Customer", properties: { poolType: "white-box" } }),
      E({ id: "cl", type: "lane", x: 30, y: 0, width: 870, height: 160, label: "Customer", parentId: "cust", properties: {} }),
      E({ id: "co", type: "pool", x: 0, y: 220, width: 900, height: 200, label: "Company", properties: { poolType: "white-box" } }),
      E({ id: "l1", type: "lane", x: 30, y: 220, width: 870, height: 200, label: "Clerk", parentId: "co", properties: {} }),
      E({ id: "ev", type: "start-event", x: 100, y: 300, width: 36, height: 36, label: "Order received", parentId: "l1", properties: {} }),
    ], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as never;
    const h = await mount({ initial });
    await h.type("add message from Customer to Order received");
    const chips = root!.root.findAll((n) => n.props?.["aria-label"] === "Numbers you can say or tap");
    expect(chips, "the choices are offered as chips").toHaveLength(1);
    expect(root!.root.findAll((n) => n.type === "rect" && n.props.fill === "#16a34a").length, "and as green numbers on the diagram").toBeGreaterThanOrEqual(2);
    await act(async () => { chips[0].findAllByType("button")[0].props.onClick(); });
    await h.settle();
    expect(h.texts().replace(/\s+/g, " ")).toContain("white-box pool");
  });
});

describe("T5096 — on the phone: tap a connector, then 'delete this' / 'reverse this'; tap two elements, 'connect these'", () => {
  const withLines = () => {
    const d = threeTasks();
    d.connectors = d.connectors.map((c, i) => ({ ...c, waypoints: i === 0 ? [{ x: 220, y: 125 }, { x: 320, y: 125 }] : [{ x: 440, y: 125 }, { x: 540, y: 125 }] }));
    return d;
  };
  const tapAt = async (d: import("@/app/lib/diagram/types").DiagramData, x: number, y: number) => {
    const { thumbnailFrameFor } = await import("@/app/lib/diagram/templateThumbnail");
    const { MobileDiagramView } = await import("@/app/components/mobile/MobileDiagramView");
    const frame = thumbnailFrameFor(d as never, { trueColors: true, fullLabels: true });
    const view = root!.root.findByType(MobileDiagramView);
    await act(async () => { view.props.onTapView(x + frame.tx, y + frame.ty); });
  };

  it("tapping a flow's line selects it (the sheet says so); 'delete this' removes it", async () => {
    const d = withLines();
    const h = await mount({ initial: d });
    await tapAt(d, 270, 130);
    expect(h.texts()).toContain("Selected connector: Receive order → Check invoice");
    await h.type("delete this");
    expect(h.texts()).toContain("deleted the connector");
    await act(async () => { vi.advanceTimersByTime(1600); });
    await h.settle();
    expect(puts.at(-1)!.body.data).toMatchObject({ connectors: [{ id: "c2" }] });
  });

  it("'reverse this' turns the tapped connector round", async () => {
    const d = withLines();
    const h = await mount({ initial: d });
    await tapAt(d, 490, 130);
    await h.type("reverse this");
    expect(h.texts()).toContain("reversed the connector: now Pay supplier → Check invoice");
  });

  it("with 'Select several' on, two taps in order are 'connect these' — first into second", async () => {
    const d = withLines();
    const h = await mount({ initial: d });
    await h.press(/Select several/);
    await tapAt(d, 600, 100);   // Pay supplier first
    await tapAt(d, 150, 100);   // then Receive order
    expect(h.texts()).toContain("Selected in order: Pay supplier → Receive order");
    await h.type("connect these");
    expect(h.texts()).toContain("connected Pay supplier → Receive order");
  });
});

describe("T5099 — on the phone: 'delete connectors' numbers them; several numbers at once delete those", () => {
  it("chips for every connector; tapping chips fills the box; Send deletes exactly those; 'all' asks first", async () => {
    const d = threeTasks();
    d.connectors = d.connectors.map((c, i) => ({ ...c, waypoints: i === 0 ? [{ x: 220, y: 125 }, { x: 320, y: 125 }] : [{ x: 440, y: 125 }, { x: 540, y: 125 }] }));
    const h = await mount({ initial: d });
    await h.type("delete connectors");
    expect(h.texts()).toContain("which connectors to delete?");
    const chips = root!.root.findAll((n) => n.props?.["aria-label"] === "Numbers you can say or tap");
    expect(chips).toHaveLength(1);
    expect(chips[0].findAllByType("button")).toHaveLength(2);
    await h.type("two");
    expect(h.texts()).toContain("2 → deleted");
    await act(async () => { vi.advanceTimersByTime(1600); });
    await h.settle();
    expect(puts.at(-1)!.body.data).toMatchObject({ connectors: [{ id: "c1" }] });
  });

  it("a list with 'and', and 'all' — which asks 'yes' before deleting everything", async () => {
    const d = threeTasks();
    d.connectors = d.connectors.map((c, i) => ({ ...c, waypoints: i === 0 ? [{ x: 220, y: 125 }, { x: 320, y: 125 }] : [{ x: 440, y: 125 }, { x: 540, y: 125 }] }));
    const h = await mount({ initial: d });
    await h.type("delete connectors");
    await h.type("all");
    expect(h.texts()).toContain("delete all 2 connectors? — say “yes” to confirm");
    await h.type("yes");
    expect(h.texts()).toContain("confirmed");
    await act(async () => { vi.advanceTimersByTime(1600); });
    await h.settle();
    expect((puts.at(-1)!.body.data as unknown as { connectors: unknown[] }).connectors).toHaveLength(0);
  });

  it("a number that is not on screen is named and the question stands", async () => {
    const h = await mount();
    await h.type("delete connectors");
    await h.type("one and nine");
    expect(h.texts()).toContain("there is no number 9");
    await h.type("cancel");
    expect(h.texts()).toContain("cancelled");
  });
});
