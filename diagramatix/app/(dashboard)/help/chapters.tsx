import type { HelpChapter } from "./HelpViewer";

/* ================================================================
   Diagramatix In-App User Guide — chapter content
   ================================================================

   Each chapter has a slug (used in the URL ?c=slug), a title,
   and one or more sections.  Sections can include an optional
   screenshot path (under /help/images/…).

   To add a screenshot:
   1. Save the PNG to  public/help/images/<name>.png
   2. Set  image: "/help/images/<name>.svg"  on the section.
   ================================================================ */

export const CHAPTERS: HelpChapter[] = [
  /* ──────────────────────────────────────────────── 1 ── */
  {
    slug: "getting-started",
    title: "Getting Started",
    sections: [
      {
        body: (
          <>
            <p>
              Diagramatix is a web-based diagramming tool for creating
              professional process diagrams, BPMN workflows, state machines,
              context diagrams, domain models and more.
            </p>
            <p className="mt-2">
              After signing in you land on the <strong>Dashboard</strong> —
              your home base for managing projects and diagrams.
            </p>
          </>
        ),
        image: "/help/images/dashboard-overview.svg",
        imageAlt: "Dashboard overview",
        imageCaption: "The Dashboard — your projects and diagrams at a glance.",
      },
      {
        heading: "Signing in",
        body: (
          <p>
            Sign in with your email and password, or use your Microsoft
            account. After first sign-in a default organisation is created
            for you automatically.
          </p>
        ),
      },
      {
        heading: "Quick start",
        body: (
          <ol className="list-decimal list-inside space-y-1">
            <li>Click <strong>+ New Project</strong> to create a project.</li>
            <li>Inside the project, click <strong>+ New Diagram</strong> and choose a diagram type.</li>
            <li>Drag elements from the <strong>Palette</strong> on the left onto the canvas.</li>
            <li>Click an element, then click another to draw a <strong>connector</strong> between them.</li>
            <li>Double-click any element or connector label to <strong>edit text</strong>.</li>
            <li>Your work is <strong>auto-saved</strong> every few seconds.</li>
          </ol>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 2 ── */
  {
    slug: "projects-folders",
    title: "Projects & Folders",
    sections: [
      {
        body: (
          <p>
            Projects are the top-level containers for your diagrams.
            Every diagram belongs to a project (or sits in the
            &ldquo;Unorganised&rdquo; section on the dashboard).
          </p>
        ),
      },
      {
        heading: "Creating a project",
        body: (
          <p>
            Click <strong>+ New Project</strong> on the dashboard. Give it a
            name and press Enter or click Create.
          </p>
        ),
      },
      {
        heading: "Folders inside a project",
        body: (
          <>
            <p>
              Inside a project you can create <strong>folders</strong> to
              organise related diagrams. Use the <strong>+ New Folder</strong>
              button at the top of the project page.
            </p>
            <p className="mt-2">
              Drag diagrams between folders, or drag them to the root level.
              Folder structure is preserved through backup, restore, and
              project export/import.
            </p>
          </>
        ),
        image: "/help/images/project-folders.svg",
        imageAlt: "Project with folders",
        imageCaption: "Folders help you organise diagrams within a project.",
      },
      {
        heading: "Deleting a project",
        body: (
          <p>
            Click the <strong>trash</strong> icon next to a project name.
            Deleted projects and their diagrams are moved to an internal
            archive and can be recovered by an administrator.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 3 ── */
  {
    slug: "diagram-types",
    title: "Diagram Types",
    sections: [
      {
        body: (
          <p>
            Diagramatix supports six diagram types. Each type has its own
            symbol palette and connector rules.
          </p>
        ),
      },
      {
        heading: "BPMN",
        body: (
          <>
            <p>
              Full Business Process Model and Notation diagrams.
              Includes tasks (user, service, script, send, receive, manual,
              business-rule), gateways (exclusive, inclusive, parallel,
              event-based), start/intermediate/end events with triggers
              (message, timer, error, signal, terminate, conditional,
              escalation, cancel, compensation, link), pools, lanes,
              subprocesses (collapsed and expanded), data objects, data stores,
              groups and text annotations.
            </p>
            <p className="mt-2">
              BPMN diagrams support <strong>auto-connect</strong>,{" "}
              <strong>smart alignment</strong>, and{" "}
              <strong>right-click quick-add</strong> — see dedicated chapters
              below.
            </p>
          </>
        ),
        image: "/help/images/bpmn-example.svg",
        imageAlt: "BPMN diagram",
        imageCaption: "A BPMN process diagram with tasks, gateways, and events.",
      },
      {
        heading: "Context Diagram",
        body: (
          <p>
            Shows a central system and external entities that interact with
            it. Uses ellipses for the system and rectangles for external
            entities, connected by bi-directional flows.
          </p>
        ),
      },
      {
        heading: "Process Context Diagram",
        body: (
          <p>
            Similar to a context diagram but focused on a specific process.
            Includes actors, teams, and process-system elements.
          </p>
        ),
      },
      {
        heading: "State Machine",
        body: (
          <p>
            Model the states and transitions of a system. Includes
            rounded states, initial state (filled circle), final state
            (bull&apos;s eye), composite states, and transitions with
            guard labels.
          </p>
        ),
      },
      {
        heading: "Basic Flowchart",
        body: (
          <p>
            Simple boxes and arrows for general-purpose flowcharts.
          </p>
        ),
      },
      {
        heading: "Domain Model",
        body: (
          <p>
            UML-style class diagrams with classes, enumerations, and
            relationships (association, aggregation, composition,
            generalisation).
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 4 ── */
  {
    slug: "canvas-basics",
    title: "Canvas Basics",
    sections: [
      {
        body: (
          <p>
            The canvas is the main working area where you build your diagram.
            It is an SVG-based surface with pan, zoom and selection.
          </p>
        ),
      },
      {
        heading: "Panning",
        body: (
          <p>
            Click and drag on an empty area of the canvas to <strong>pan</strong>.
            The canvas extends infinitely in all directions.
          </p>
        ),
      },
      {
        heading: "Zooming",
        body: (
          <p>
            Use the <strong>mouse wheel</strong> to zoom in and out. The zoom
            level is shown in the toolbar. You can also use the zoom
            controls in the toolbar.
          </p>
        ),
      },
      {
        heading: "Selecting",
        body: (
          <>
            <p>
              <strong>Click</strong> an element to select it. A blue selection
              border appears with resize handles.
            </p>
            <p className="mt-2">
              <strong>Click and drag</strong> on empty canvas to draw a{" "}
              <strong>selection rectangle</strong> — all elements inside it
              will be selected.
            </p>
            <p className="mt-2">
              Press <strong>Escape</strong> to deselect everything.
            </p>
          </>
        ),
      },
      {
        heading: "Moving elements",
        body: (
          <>
            <p>
              <strong>Drag</strong> a selected element to move it. All
              connected connectors automatically re-route.
            </p>
            <p className="mt-2">
              Use the <strong>arrow keys</strong> to nudge selected elements
              by 1 pixel at a time for precise positioning.
            </p>
          </>
        ),
      },
      {
        heading: "Resizing elements",
        body: (
          <p>
            Drag any of the <strong>corner or edge handles</strong> on a
            selected element to resize it. Connectors re-route automatically.
          </p>
        ),
      },
      {
        heading: "Deleting",
        body: (
          <p>
            Select an element or connector and press the <strong>Delete</strong>{" "}
            key.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 5 ── */
  {
    slug: "palette",
    title: "Palette & Elements",
    sections: [
      {
        body: (
          <p>
            The <strong>Palette</strong> appears on the left side of the
            diagram editor. It shows all available symbol types for the
            current diagram type.
          </p>
        ),
        image: "/help/images/palette-bpmn.svg",
        imageAlt: "BPMN Palette",
        imageCaption: "The Palette for a BPMN diagram.",
      },
      {
        heading: "Adding elements",
        body: (
          <>
            <p>
              <strong>Drag</strong> a symbol from the palette and drop it onto
              the canvas. The element appears at the drop position.
            </p>
            <p className="mt-2">
              In BPMN diagrams, dropping an element near existing elements
              may trigger <strong>auto-connect</strong> (see the Auto-Connect
              chapter).
            </p>
          </>
        ),
      },
      {
        heading: "Right-click quick-add (BPMN)",
        body: (
          <>
            <p>
              In BPMN diagrams, <strong>right-click</strong> on empty canvas
              to open a quick-add popup showing 10 common shapes in a grid:
            </p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>Start Event</li>
              <li>Task</li>
              <li>Sub-Process</li>
              <li>Expanded Sub-Process</li>
              <li>Intermediate Event</li>
              <li>End Event</li>
              <li>Data Object</li>
              <li>Data Store</li>
              <li>Annotation (Text)</li>
              <li>Group</li>
            </ol>
            <p className="mt-2">
              Click a shape to place it at the right-click position. Auto-connect
              rules apply automatically.
            </p>
          </>
        ),
        image: "/help/images/quick-add.svg",
        imageAlt: "Quick-add popup",
        imageCaption: "Right-click quick-add popup for BPMN diagrams.",
      },
      {
        heading: "Dropping into expanded subprocesses",
        body: (
          <p>
            When you drop an element inside an <strong>expanded subprocess</strong>,
            it is automatically added as a child of that subprocess and
            shrunk to 75% size to fit the subprocess context.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 6 ── */
  {
    slug: "connectors",
    title: "Connectors & Routing",
    sections: [
      {
        body: (
          <p>
            Connectors represent the relationships and flows between
            elements. Diagramatix uses smart orthogonal routing with
            obstacle avoidance to produce clean, professional diagrams.
          </p>
        ),
      },
      {
        heading: "Drawing a connector",
        body: (
          <>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click the <strong>source</strong> element to select it.</li>
              <li>Click on a <strong>target</strong> element — a connector is created between them.</li>
            </ol>
            <p className="mt-2">
              The connector type is chosen automatically based on the diagram
              type (e.g. sequence flow in BPMN, transition in state machine).
            </p>
          </>
        ),
      },
      {
        heading: "Connector types",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Sequence</strong> — standard BPMN flow (solid line, filled arrow)</li>
            <li><strong>Message</strong> — BPMN message flow (dashed line, open arrow)</li>
            <li><strong>Association</strong> — BPMN association (dotted line)</li>
            <li><strong>Transition</strong> — state machine transition</li>
            <li><strong>Flow</strong> — context diagram flow</li>
            <li><strong>UML Association / Aggregation / Composition / Generalisation</strong> — domain model relationships</li>
          </ul>
        ),
      },
      {
        heading: "Routing styles",
        body: (
          <>
            <p>Three routing styles are available in the properties panel:</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li><strong>Rectilinear</strong> — right-angle bends (default for most connectors)</li>
              <li><strong>Direct</strong> — straight line from source to target</li>
              <li><strong>Curvilinear</strong> — smooth curved path</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Editing connector labels",
        body: (
          <p>
            <strong>Double-click</strong> a connector to edit its label.
            Labels are automatically positioned at the midpoint of the
            connector. For sequence connectors from gateways, the label
            represents the condition/guard.
          </p>
        ),
      },
      {
        heading: "Smart routing",
        body: (
          <p>
            Connectors automatically route around other elements to avoid
            overlaps. When you move an element, all connected connectors
            re-route in real time.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 7 ── */
  {
    slug: "auto-connect",
    title: "Auto-Connect (BPMN)",
    sections: [
      {
        body: (
          <p>
            When you add a new element to a BPMN diagram (by dragging from
            the palette or using right-click quick-add), Diagramatix
            automatically connects it to nearby existing elements. This
            dramatically speeds up process modelling.
          </p>
        ),
      },
      {
        heading: "How it works",
        body: (
          <>
            <p>The auto-connect algorithm checks three cases in priority order:</p>
            <ol className="list-decimal list-inside space-y-2 mt-2">
              <li>
                <strong>Case A — Element to the left:</strong> If there is an
                element strictly to the left (no vertical overlap), the nearest
                one by proposed connector length is connected from its right
                side to the new element&apos;s left side.
              </li>
              <li>
                <strong>Case B — Element above or below:</strong> If there is
                an element directly above or below (with horizontal overlap),
                a vertical connector is created.
              </li>
              <li>
                <strong>Case C — Element to the left with vertical overlap:</strong>{" "}
                For elements that are to the left and vertically overlapping,
                a horizontal connector is created.
              </li>
            </ol>
          </>
        ),
      },
      {
        heading: "Decision gateway special behaviour",
        body: (
          <p>
            If a <strong>decision gateway</strong> is nearby, it takes priority
            as the auto-connect source. This reflects the common pattern
            where new paths branch from a decision point. Double-click a
            gateway to connect a group of elements to it.
          </p>
        ),
      },
      {
        heading: "Cancelling auto-connect",
        body: (
          <p>
            Press <strong>Escape</strong> immediately after dropping an element
            to cancel the auto-connect and keep the element unconnected.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 8 ── */
  {
    slug: "properties",
    title: "Properties Panel",
    sections: [
      {
        body: (
          <p>
            The <strong>Properties Panel</strong> appears on the right side of
            the diagram editor when an element or connector is selected. It
            lets you configure all aspects of the selected item.
          </p>
        ),
        image: "/help/images/properties-panel.svg",
        imageAlt: "Properties Panel",
        imageCaption: "The Properties Panel showing element properties.",
      },
      {
        heading: "Element properties",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Label</strong> — the display text</li>
            <li><strong>Task type</strong> (BPMN) — user, service, script, send, receive, manual, business-rule</li>
            <li><strong>Gateway type</strong> (BPMN) — exclusive, inclusive, parallel, event-based</li>
            <li><strong>Event type</strong> (BPMN) — message, timer, error, signal, terminate, etc.</li>
            <li><strong>Repeat marker</strong> — none, loop, multi-instance sequential, multi-instance parallel</li>
            <li><strong>Ad-hoc</strong> (subprocesses) — marks the subprocess as ad-hoc</li>
            <li><strong>Boundary events</strong> — intermediate events attached to task edges</li>
          </ul>
        ),
      },
      {
        heading: "Connector properties",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Label</strong> — connector label text</li>
            <li><strong>Routing</strong> — rectilinear, direct, or curvilinear</li>
            <li><strong>Direction</strong> — directed, non-directed, open-directed, both</li>
            <li><strong>Connector type</strong> — depends on diagram type</li>
          </ul>
        ),
      },
      {
        heading: "Diagram settings",
        body: (
          <p>
            Click on empty canvas (deselect everything) to see{" "}
            <strong>Diagram Settings</strong> in the properties panel. Here
            you can configure the diagram colour scheme, display mode,
            and other diagram-wide options.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 9 ── */
  {
    slug: "subprocesses",
    title: "Subprocesses & Linked Diagrams",
    sections: [
      {
        body: (
          <p>
            BPMN subprocesses come in two forms: <strong>collapsed</strong>{" "}
            (shown as a small box with a &ldquo;+&rdquo; marker) and{" "}
            <strong>expanded</strong> (a large container that holds child
            elements).
          </p>
        ),
      },
      {
        heading: "Collapsed subprocess",
        body: (
          <p>
            A collapsed subprocess can be <strong>linked to another diagram</strong>.
            Double-click the subprocess to navigate to the linked diagram.
            Set the linked diagram in the Properties Panel.
          </p>
        ),
      },
      {
        heading: "Expanded subprocess",
        body: (
          <>
            <p>
              An expanded subprocess acts as a container. Drag elements from
              the palette directly into the expanded subprocess to add child
              elements.
            </p>
            <p className="mt-2">
              Elements dropped inside an expanded subprocess are automatically
              <strong> scaled to 75%</strong> of their normal size to fit
              the subprocess context.
            </p>
          </>
        ),
      },
      {
        heading: "Boundary events",
        body: (
          <p>
            Drag an <strong>intermediate event</strong> onto the edge of a
            task or subprocess to create a boundary event. Boundary events
            snap to the nearest edge and move with their host element.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 10 ── */
  {
    slug: "alignment",
    title: "Smart Alignment",
    sections: [
      {
        body: (
          <p>
            Select two or more elements to reveal the{" "}
            <strong>Alignment</strong> dropdown in the toolbar. It offers
            standard alignment options plus a powerful smart-align feature.
          </p>
        ),
      },
      {
        heading: "Standard alignment",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Align Left / Right / Top / Bottom</strong> — aligns to the edge of the selection</li>
            <li><strong>Align Centres Horizontally</strong> — aligns to the average horizontal centre</li>
            <li><strong>Align Centres Vertically</strong> — aligns to the average vertical centre</li>
          </ul>
        ),
      },
      {
        heading: "Smart Align",
        body: (
          <>
            <p>
              Smart Align detects logical <strong>rows</strong> (elements whose
              vertical extents overlap) and <strong>columns</strong> (elements
              whose horizontal extents overlap) using a union-find clustering
              algorithm with a 12-pixel tolerance.
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Each row of 2+ elements snaps to its median Y-centre.</li>
              <li>Each column of 2+ elements snaps to its median X-centre.</li>
              <li>Elements in both a row and column are aligned on both axes.</li>
            </ul>
            <p className="mt-2">
              This turns a messy arrangement into a clean grid in a single
              click.
            </p>
          </>
        ),
        image: "/help/images/smart-align.svg",
        imageAlt: "Smart alignment before and after",
        imageCaption: "Before and after Smart Align — messy layout to clean grid.",
      },
    ],
  },

  /* ──────────────────────────────────────────────── 11 ── */
  {
    slug: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    sections: [
      {
        body: (
          <div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-semibold">Shortcut</th>
                  <th className="text-left py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Ctrl+Z</td><td>Undo</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Ctrl+Shift+Z / Ctrl+Y</td><td>Redo</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Ctrl+S</td><td>Save now</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Delete</td><td>Delete selected element or connector</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Arrow keys</td><td>Nudge selected element(s) by 1 pixel</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Escape</td><td>Deselect / cancel connection mode / dismiss popup</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Enter</td><td>Commit label edit</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Shift+Enter</td><td>Line break in label</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Double-click</td><td>Edit element or connector label</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Right-click</td><td>Quick-add popup (BPMN only)</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Mouse wheel</td><td>Zoom in / out</td></tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-gray-500">
              On macOS, use Cmd instead of Ctrl.
            </p>
          </div>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 12 ── */
  {
    slug: "export-import",
    title: "Import & Export",
    sections: [
      {
        body: (
          <p>
            Diagramatix supports multiple export and import formats.
            Access them from the <strong>File</strong> menu in both the
            diagram editor and the project page.
          </p>
        ),
      },
      {
        heading: "Export PDF",
        body: (
          <p>
            Exports the current diagram as a PDF file. You can choose a
            <strong> scale</strong> (100%, 75%, 50%, or 25%) before
            exporting. The scale popup appears when you click Export PDF.
          </p>
        ),
      },
      {
        heading: "Export Visio",
        body: (
          <p>
            Exports the current BPMN diagram as a Microsoft Visio
            (.vsdx) file. Colours from your diagram settings are applied
            to the Visio masters. Only available for BPMN diagrams.
          </p>
        ),
      },
      {
        heading: "Export SVG",
        body: (
          <p>
            Exports the diagram as a scalable vector graphic. Ideal for
            embedding in documents or web pages at any resolution.
          </p>
        ),
      },
      {
        heading: "Export JSON",
        body: (
          <p>
            Exports the diagram in Diagramatix&apos;s native JSON format.
            This format preserves all diagram data including properties,
            colours, and display settings. Use this for archival or
            transferring between Diagramatix instances.
          </p>
        ),
      },
      {
        heading: "Export XML",
        body: (
          <>
            <p>
              Exports the diagram in a structured XML format. An{" "}
              <strong>XSD schema file</strong> is automatically downloaded
              alongside the XML so external tools can validate the file.
            </p>
            <p className="mt-2">
              The XSD file is versioned (e.g.{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">diagramatix-export-v1.3.xsd</code>)
              to match the export format version.
            </p>
          </>
        ),
      },
      {
        heading: "Import JSON / Import XML",
        body: (
          <>
            <p>
              Import a previously exported JSON or XML file.
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                <strong>From the diagram editor:</strong> replaces the
                current diagram&apos;s contents with the imported data.
              </li>
              <li>
                <strong>From the dashboard or project page:</strong> creates
                a new project with the imported diagrams alongside your
                existing content.
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: "Project export/import",
        body: (
          <p>
            From the project page, <strong>Export JSON</strong> or{" "}
            <strong>Export XML</strong> exports the entire project including
            all diagrams and folder structure. Importing creates a new
            project with the full folder hierarchy preserved.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 13 ── */
  {
    slug: "backup-restore",
    title: "Backup & Restore",
    sections: [
      {
        body: (
          <p>
            The backup feature creates a complete snapshot of all your
            projects and diagrams in a single{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">.diag</code>{" "}
            file.
          </p>
        ),
      },
      {
        heading: "Creating a backup",
        body: (
          <ol className="list-decimal list-inside space-y-1">
            <li>Go to the <strong>Dashboard</strong>.</li>
            <li>Click <strong>File ▾</strong> in the header.</li>
            <li>Click <strong>Backup...</strong></li>
            <li>
              A <code className="text-xs bg-gray-100 px-1 rounded">.diag</code>{" "}
              file downloads containing all your projects, diagrams,
              folder structures, and settings.
            </li>
          </ol>
        ),
      },
      {
        heading: "Restoring a backup",
        body: (
          <>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click <strong>File ▾ → Restore...</strong> on the dashboard.</li>
              <li>Select a <code className="text-xs bg-gray-100 px-1 rounded">.diag</code> file.</li>
              <li>
                The restored projects appear alongside your existing
                projects with <strong>&ldquo;(restored)&rdquo;</strong> in
                their names.
              </li>
            </ol>
            <p className="mt-2">
              Restore is <strong>additive</strong> — it never overwrites or
              deletes your existing content. Every restored project and
              diagram gets a new ID.
            </p>
          </>
        ),
      },
      {
        heading: "What is preserved",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>All projects and their diagrams</li>
            <li>Folder structure within each project</li>
            <li>Subprocess linked-diagram references</li>
            <li>Colour configurations and display settings</li>
          </ul>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 14 ── */
  {
    slug: "tips",
    title: "Tips & Troubleshooting",
    sections: [
      {
        heading: "Auto-save",
        body: (
          <p>
            Diagrams are auto-saved every few seconds. The save status is
            shown in the toolbar. If you see &ldquo;Unsaved changes&rdquo;,
            press <strong>Ctrl+S</strong> to force an immediate save.
          </p>
        ),
      },
      {
        heading: "Connection mode",
        body: (
          <p>
            After selecting an element, clicking on another element creates a
            connector. If you didn&apos;t intend to start a connection, press{" "}
            <strong>Escape</strong> or click on empty canvas to cancel.
          </p>
        ),
      },
      {
        heading: "Elements not lining up?",
        body: (
          <p>
            Select all the elements you want to align, then use the{" "}
            <strong>Alignment</strong> dropdown and choose{" "}
            <strong>Smart Align</strong> for automatic grid detection.
          </p>
        ),
      },
      {
        heading: "Connectors overlapping elements?",
        body: (
          <p>
            Try moving the elements slightly — the smart routing algorithm
            will recalculate paths to avoid obstacles. For stubborn cases,
            you can switch a connector to <strong>Direct</strong> routing
            in the properties panel.
          </p>
        ),
      },
      {
        heading: "Boundary events not attaching?",
        body: (
          <p>
            Make sure you drop the intermediate event precisely on the{" "}
            <strong>edge</strong> of the target task or subprocess. If it
            drops inside the element, it becomes a child rather than a
            boundary event.
          </p>
        ),
      },
    ],
  },
];
