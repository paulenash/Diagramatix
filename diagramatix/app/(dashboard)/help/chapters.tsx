import type { HelpChapter } from "./HelpViewer";

/* ================================================================
   Diagramatix In-App User Guide — chapter content
   ================================================================

   Each chapter has a slug (used in the URL ?c=slug), a title,
   and one or more sections.  Sections can include an optional
   screenshot path (under /help/images/…).

   To add a screenshot:
   1. Save the PNG to  public/help/images/<name>.png
   2. Set  image: "/help/images/<name>.png"  on the section.
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
              context diagrams, process context diagrams, value chains,
              domain models and more.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              This guide covers version <strong>1.7</strong>.
            </p>
            <p className="mt-2">
              After signing in you land on the <strong>Dashboard</strong> —
              your home base for managing projects and diagrams.
            </p>
          </>
        ),
        image: "/help/images/dashboard-overview.png",
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
        image: "/help/images/project-folders.png",
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
        image: "/help/images/bpmn-example.png",
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
            Shows processes within a Process Group boundary, with external
            actors, teams, systems, and auto-schedulers connected by
            associations. Five element types:{" "}
            <strong>Use Case</strong> (process),{" "}
            <strong>Actor</strong> (person/role),{" "}
            <strong>Team</strong> (department/group),{" "}
            <strong>System</strong> (IT system),{" "}
            <strong>Hourglass</strong> (auto-scheduler/timer).
            AI generation includes process numbering (P-XX-NN format),
            zigzag layout, and smart actor placement.
          </p>
        ),
      },
      {
        heading: "State Machine",
        body: (
          <>
            <p>
              Model the states and transitions of a system. Includes
              states, initial state (filled circle), final state
              (bull&apos;s eye), composite states, sub-machine states
              (with linked diagrams), decision/merge gateways,
              fork/join bars, and curvilinear transitions with
              guard labels.
            </p>
            <p className="mt-2">
              State machine diagrams support <strong>auto-connect</strong>,{" "}
              <strong>right-click quick-add</strong>,{" "}
              <strong>drop-on-connector insertion</strong>,{" "}
              <strong>self-transitions</strong>, and{" "}
              <strong>insert space</strong>.
            </p>
          </>
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
      {
        heading: "Value Chain",
        body: (
          <>
            <p>
              Process-based value chain diagrams. Three element
              types: <strong>Process</strong> (process step),{" "}
              <strong>Collapsed Process</strong> (with linked diagram
              drill-through), and <strong>Value Chain</strong>{" "}
              (container rectangle).
            </p>
            <p className="mt-2">
              Features <strong>process colour themes</strong> (right-click
              on 2+ selected processes), <strong>description boxes</strong>{" "}
              below each process, automatic <strong>horizontal snap</strong>{" "}
              with 10px overlap, and <strong>value chain nesting</strong>{" "}
              with automatic shade lightening. No connectors in this
              diagram type.
            </p>
          </>
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
        imageCaption: "The canvas with zoom slider, palette, and properties panel.",
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
        heading: "Initial zoom when opening a diagram",
        body: (
          <>
            <p>
              Diagrams open at <strong>70% zoom</strong> by default — chosen to
              keep element text legible on most screens. Small diagrams that
              fit the viewport at that zoom are <strong>centred</strong>;
              larger diagrams are <strong>anchored to the top-left</strong>{" "}
              so you start reading at the process&rsquo;s natural entry point.
            </p>
            <p className="mt-2">
              To change the default, go to{" "}
              <strong>Dashboard &rarr; File &rarr; Initial Zoom&hellip;</strong>{" "}
              and enter a percentage (e.g. 50, 75, 100). The value is stored
              per-browser and becomes the slider&rsquo;s &ldquo;100%&rdquo;
              reference. Leave the field blank to revert to the 70% default.
            </p>
          </>
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
              <strong>Shift+click</strong> on additional elements to{" "}
              <strong>add them to the selection</strong> without deselecting
              what you already have.
            </p>
            <p className="mt-2">
              <strong>Click and drag</strong> on empty canvas to draw a{" "}
              <strong>selection rectangle</strong> (lasso) — all elements
              fully inside it will be selected. Hold <strong>Shift</strong>{" "}
              while releasing to <strong>add</strong> the lassoed elements to
              your existing selection instead of replacing it.
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
        image: "/help/images/palette-bpmn.png",
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
              In BPMN and State Machine diagrams, dropping an element near
              existing elements may trigger <strong>auto-connect</strong>{" "}
              (see the Auto-Connect chapter).
            </p>
          </>
        ),
      },
      {
        heading: "Right-click quick-add",
        body: (
          <>
            <p>
              In <strong>BPMN</strong> and <strong>State Machine</strong>{" "}
              diagrams, <strong>right-click</strong> on empty canvas
              to open a quick-add popup showing common shapes in a grid.
              BPMN shows 10 shapes:
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
              State Machine shows 7 shapes: State, SubMachine, Initial,
              Final, Composite, Gateway, Fork/Join.
            </p>
            <p className="mt-2">
              Click a shape to place it at the right-click position. Auto-connect
              rules apply automatically.
            </p>
          </>
        ),
        image: "/help/images/quick-add.png",
        imageAlt: "Quick-add popup",
        imageCaption: "Right-click quick-add popup.",
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
        imageCaption: "Sequence, message, and association connectors between BPMN elements.",
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
    title: "Auto-Connect",
    sections: [
      {
        body: (
          <p>
            When you add a new element to a <strong>BPMN</strong> or{" "}
            <strong>State Machine</strong> diagram (by dragging from the
            palette or using right-click quick-add), Diagramatix
            automatically connects it to nearby existing elements. This
            dramatically speeds up modelling.
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
        heading: "State Machine rules",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Initial State</strong> with no outgoing transition takes
              priority as the auto-connect source when a new element is added.
            </li>
            <li>
              Never auto-connects <strong>TO</strong> an Initial State or
              Final State.
            </li>
            <li>
              Never auto-connects <strong>FROM</strong> a Final State.
            </li>
            <li>
              Initial → Initial and Final → Final connections are blocked.
            </li>
            <li>
              Prefers elements inside the same <strong>Composite State</strong>.
            </li>
          </ul>
        ),
      },
      {
        heading: "Self-transitions (State Machine)",
        body: (
          <p>
            States, Composite States, and SubMachines support{" "}
            <strong>self-transitions</strong>. Drag a connection from an
            element and release on the <strong>same element</strong> — a
            looping transition is created on the nearest side, extending
            60px outward with source and target points 40px apart.
          </p>
        ),
      },
      {
        heading: "BPMN sequence connector rules",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              Never auto-connect <strong>TO</strong> a Start Event
              (exception: boundary-mounted start events can receive
              from outside their host subprocess).
            </li>
            <li>
              Never auto-connect <strong>FROM</strong> an End Event.
            </li>
            <li>
              No sequence connectors <strong>to or from</strong> an
              Event Expanded Subprocess.
            </li>
            <li>
              No sequence connectors <strong>into or out of</strong> an
              Event Expanded Subprocess — internal connections only.
            </li>
            <li>
              Edge-mounted End/Intermediate Events cannot connect{" "}
              <strong>inside</strong> their host subprocess.
            </li>
            <li>
              Target highlighting (green) is synced with these rules —
              only valid targets are highlighted.
            </li>
          </ul>
        ),
      },
      {
        heading: "BPMN message connector behaviour",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              Connecting a task to a <strong>non-System</strong> black-box
              pool sets the task type to <strong>Send</strong> (source)
              or <strong>Receive</strong> (target).
            </li>
            <li>
              Connecting a task to a <strong>System</strong> black-box
              pool sets the task type to <strong>User</strong> regardless
              of direction.
            </li>
          </ul>
        ),
      },
      {
        heading: "Force-connect override (BPMN)",
        body: (
          <>
            <p>
              To create a sequence connector that bypasses all validation
              rules:
            </p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>
                Click to select the <strong>source</strong> element.
              </li>
              <li>
                <strong>Shift+Ctrl+Click</strong> the source — an orange
                &ldquo;Force Connect&rdquo; banner appears.
              </li>
              <li>
                Click the <strong>target</strong> element — a forced
                sequence connector is created.
              </li>
            </ol>
            <p className="mt-2">
              Press <strong>Escape</strong> or click the background to
              cancel force-connect mode.
            </p>
          </>
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
        image: "/help/images/properties-panel.png",
        imageAlt: "Properties Panel",
        imageCaption: "The Properties Panel showing element properties.",
      },
      {
        heading: "Element properties",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Label</strong> — the display text</li>
            <li><strong>Task type</strong> (BPMN) — user, service, script, send, receive, manual, business-rule</li>
            <li><strong>Convert Task ↔ Subprocess</strong> (BPMN) — change a task to a subprocess or vice versa</li>
            <li><strong>Gateway type</strong> (BPMN) — exclusive, inclusive, parallel, event-based</li>
            <li><strong>Gateway role</strong> — decision or merge</li>
            <li><strong>Event type</strong> (BPMN) — message, timer, error, signal, terminate, etc.</li>
            <li><strong>Repeat marker</strong> — none, loop, multi-instance sequential, multi-instance parallel</li>
            <li><strong>Ad-hoc</strong> (subprocesses) — marks the subprocess as ad-hoc</li>
            <li><strong>Boundary events</strong> — intermediate events attached to task edges</li>
            <li><strong>Linked Diagram</strong> (subprocess, SubMachine) — select a sibling diagram to drill into</li>
            <li><strong>Fork/Join orientation</strong> — flip between vertical and horizontal</li>
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
        heading: "Diagram title block",
        body: (
          <>
            <p>
              When nothing is selected, the Properties Panel shows the{" "}
              <strong>Diagram Title</strong> section. Here you can configure
              a title block that appears centred above the diagram content:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                <strong>Show (On/Off)</strong> — toggle the title block
                on the canvas. When Off, the title is hidden but the
                metadata is still saved.
              </li>
              <li>
                <strong>Status</strong> — Draft, Final, or Production.
                Displayed in the title block.
              </li>
              <li>
                <strong>Name</strong> — the diagram name (set when the
                diagram was created; rename from the project page).
              </li>
              <li>
                <strong>Version</strong> — free-text version string
                (e.g. &ldquo;1.0&rdquo;, &ldquo;2.3-beta&rdquo;).
              </li>
              <li>
                <strong>Authors</strong> — free-text author name(s).
              </li>
            </ul>
            <p className="mt-2">
              The title block also shows the <strong>Created</strong> date
              and <strong>Modified</strong> date/time automatically.
            </p>
          </>
        ),
        image: "/help/images/title-block.png",
        imageAlt: "Diagram title block",
        imageCaption: "The title block shown above the diagram content.",
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
      {
        heading: "SubMachine (State Machine)",
        body: (
          <>
            <p>
              A <strong>SubMachine</strong> is the state machine equivalent
              of a collapsed subprocess. It can be linked to another
              state machine diagram in the same project.
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                The marker (two small rounded states connected by a line)
                in the bottom-right corner turns <strong>blue</strong>{" "}
                when linked, grey when unlinked.
              </li>
              <li>
                <strong>Double-click</strong> the marker to drill into the
                linked diagram.
              </li>
              <li>
                The linked diagram&apos;s initial state shows a{" "}
                <strong>back arrow</strong> — double-click it to return.
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: "Fork/Join (State Machine)",
        body: (
          <p>
            A <strong>Fork/Join</strong> bar represents concurrent state
            transitions. It appears as a thick black bar, initially vertical
            (5 x 100px). Use the <strong>Flip</strong> button in the
            Properties Panel to switch between vertical and horizontal
            orientation. Resize by dragging the handles on the long ends.
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
        image: "/help/images/smart-align.png",
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
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Shift+click</td><td>Add element to selection / toggle selection</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Shift+lasso</td><td>Add lassoed elements to existing selection</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Ctrl+click canvas</td><td>Place space-insertion marker (BPMN only)</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Shift+drag marker</td><td>Insert horizontal or vertical space</td></tr>
                <tr><td className="py-1.5 pr-4 font-mono text-xs">Shift+Ctrl+click</td><td>Force-connect sequence connector (BPMN)</td></tr>
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
      {
        heading: "Import DDL",
        body: (
          <p>
            From the Dashboard, <strong>File ▾ → Import DDL</strong>{" "}
            imports a SQL DDL file and creates a new project with a
            Domain Diagram. Supports PostgreSQL, MySQL, and SQL Server.
            See the <strong>Import DDL</strong> chapter for details.
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
    slug: "templates",
    title: "Templates (BPMN)",
    sections: [
      {
        body: (
          <p>
            Templates let you save reusable groups of BPMN elements and
            connectors and stamp them onto any BPMN diagram. They are
            available only in BPMN diagrams.
          </p>
        ),
      },
      {
        heading: "Applying a template",
        body: (
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Click <strong>Templates ▾</strong> in the toolbar.
            </li>
            <li>
              The dropdown lists <strong>Built-In</strong> templates
              (shared across all users) and <strong>User</strong> templates
              (yours only).
            </li>
            <li>
              Click a template name to stamp it onto the canvas at the
              current viewport centre. The new elements are automatically
              selected so you can immediately drag them into position.
            </li>
          </ol>
        ),
        image: "/help/images/templates-dropdown.png",
        imageAlt: "Templates dropdown",
        imageCaption: "The Templates dropdown showing built-in and user templates.",
      },
      {
        heading: "Creating a user template",
        body: (
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Click <strong>Templates ▾ → + Create User Template</strong>.
            </li>
            <li>
              The toolbar enters <strong>capture mode</strong> — a blue
              prompt reads &ldquo;Select elements for user template&rdquo;.
            </li>
            <li>
              Select the elements (and their connectors) you want to save.
              Use click, Shift+click, or lasso selection.
            </li>
            <li>
              Click <strong>Save as Template</strong>. Enter a name in the
              modal and confirm.
            </li>
          </ol>
        ),
      },
      {
        heading: "Editing a template",
        body: (
          <>
            <p>
              In the Templates dropdown, click the <strong>pencil icon</strong>{" "}
              next to a template. The current diagram is temporarily replaced
              with the template&apos;s elements so you can modify them.
            </p>
            <p className="mt-2">
              An amber banner shows <strong>&ldquo;Editing template:
              &lt;name&gt;&rdquo;</strong>. Select the elements you want
              to keep, then click <strong>Update Template</strong>. Your
              original diagram is restored automatically when you finish
              or cancel.
            </p>
          </>
        ),
      },
      {
        heading: "Deleting a template",
        body: (
          <p>
            Click the <strong>trash icon</strong> next to a template in
            the dropdown. The template is permanently removed.
          </p>
        ),
      },
      {
        heading: "Built-in templates (admin only)",
        body: (
          <p>
            Administrators can create <strong>built-in templates</strong>{" "}
            that are shared with all users. Click{" "}
            <strong>+ Create Built-In Template</strong> (visible only to
            admins) and enter the admin password when prompted. Built-in
            templates appear under the &ldquo;Built-In&rdquo; heading in
            every user&apos;s Templates dropdown.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 15 ── */
  {
    slug: "inserting-space",
    title: "Inserting Space",
    sections: [
      {
        body: (
          <p>
            When a diagram gets crowded you can push elements apart by
            inserting horizontal or vertical space. This is available in
            <strong>BPMN</strong> and <strong>State Machine</strong> diagrams.
          </p>
        ),
      },
      {
        heading: "How to insert space",
        body: (
          <ol className="list-decimal list-inside space-y-2">
            <li>
              <strong>Ctrl+click</strong> on an empty area of the canvas.
              A space-insertion marker (crosshair line) appears at that
              position.
            </li>
            <li>
              <strong>Shift+drag</strong> the marker <strong>horizontally</strong>{" "}
              to push all elements to the right of the marker further
              rightward, or <strong>vertically</strong> to push all elements
              below the marker further downward.
            </li>
            <li>
              Release the mouse button. The space is inserted and all
              connectors re-route automatically.
            </li>
          </ol>
        ),
        image: "/help/images/insert-space.png",
        imageAlt: "Inserting space",
        imageCaption: "Ctrl+click to place the marker, then Shift+drag to insert space.",
      },
      {
        heading: "What gets moved",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              Normal elements whose centre is beyond the marker line are
              shifted by the drag distance.
            </li>
            <li>
              <strong>Pools, lanes, and expanded subprocesses</strong> that
              the marker line cuts through are <em>stretched</em> rather
              than shifted, so they grow to accommodate the new space.
            </li>
            <li>
              Boundary events stay attached to their host element&apos;s edge
              and are re-anchored automatically.
            </li>
          </ul>
        ),
      },
      {
        heading: "Tips",
        body: (
          <>
            <p>
              Drag the marker (without Shift) to reposition it before
              inserting space. Press <strong>Escape</strong> to cancel the
              marker entirely.
            </p>
          </>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 15 ── */
  {
    slug: "drop-on-connector",
    title: "Drop onto Connector & Delete Healing",
    sections: [
      {
        body: (
          <p>
            In <strong>BPMN</strong> and <strong>State Machine</strong>{" "}
            diagrams you can insert a new element into the middle of an
            existing flow by dropping it directly onto a connector. When
            you later delete that element, the flow heals itself
            automatically.
          </p>
        ),
      },
      {
        heading: "Inserting an element onto a connector",
        body: (
          <>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                Drag a <strong>Task</strong>, <strong>Gateway</strong>,{" "}
                <strong>Subprocess</strong>, or{" "}
                <strong>Intermediate Event</strong> from the palette.
              </li>
              <li>
                Hover over a <strong>sequence connector</strong> — the
                connector highlights to show it will accept the drop.
              </li>
              <li>
                Release the mouse button. The original connector is replaced
                by <strong>two new connectors</strong>: one from the original
                source to the new element, and one from the new element to
                the original target.
              </li>
            </ol>
            <p className="mt-2">
              Only sequence connectors can be split. Message flows and
              associations are not affected.
            </p>
          </>
        ),
        image: "/help/images/drop-on-connector.png",
        imageAlt: "Dropping element onto a connector",
        imageCaption: "Drag a task onto a connector to insert it into the flow.",
      },
      {
        heading: "Delete and heal",
        body: (
          <>
            <p>
              When you delete an element that has <strong>exactly one
              incoming</strong> and <strong>one outgoing</strong> sequence
              connector, the two connectors are automatically{" "}
              <strong>bridged</strong> into a single connector from the
              upstream element to the downstream element.
            </p>
            <p className="mt-2">
              This makes it easy to remove a step from a process without
              having to manually reconnect the flow.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Applies to tasks, gateways, subprocesses, and intermediate
              events. If the element has multiple incoming or outgoing
              connectors, all connectors are simply deleted.
            </p>
          </>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 16 ── */
  {
    slug: "boundary-events",
    title: "Edge-Mounted (Boundary) Events",
    sections: [
      {
        body: (
          <p>
            In BPMN, events can be mounted on the <strong>boundary</strong>{" "}
            (edge) of a task or subprocess to model interruptions, errors,
            timers and other triggers that occur during the activity&apos;s
            execution.
          </p>
        ),
      },
      {
        heading: "Creating a boundary event",
        body: (
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Drag a <strong>Start Event</strong>,{" "}
              <strong>Intermediate Event</strong>, or{" "}
              <strong>End Event</strong> from the palette.
            </li>
            <li>
              Drop it <strong>precisely on the edge</strong> of a task,
              subprocess, or expanded subprocess. If the drop point is
              within 25 pixels of the host&apos;s boundary, the event
              <strong> snaps</strong> to the edge and becomes a boundary
              event.
            </li>
            <li>
              The event is automatically resized to the standard boundary
              event size and visually attached to the host.
            </li>
          </ol>
        ),
        image: "/help/images/boundary-event.png",
        imageAlt: "Boundary event on a task",
        imageCaption: "An intermediate timer event mounted on the boundary of a task.",
      },
      {
        heading: "Behaviour",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              Boundary events <strong>move with their host</strong> — when
              you drag the task, the boundary event stays on the same edge.
            </li>
            <li>
              When the host is <strong>resized</strong>, boundary events on
              the growing/shrinking edge shift to stay attached.
            </li>
            <li>
              <strong>Deleting</strong> the host also deletes all its
              boundary events.
            </li>
          </ul>
        ),
      },
      {
        heading: "Connection rules",
        body: (
          <>
            <p>Boundary events have special connection restrictions:</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                <strong>Catching intermediate events</strong> (e.g. timer,
                message) — can connect to elements inside the parent
                subprocess, modelling an interruption handler.
              </li>
              <li>
                <strong>Throwing intermediate events</strong> — connect to
                elements outside the parent subprocess.
              </li>
              <li>
                <strong>Boundary start events</strong> — can only connect to
                children of their parent subprocess.
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: "Common patterns",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Timer boundary event</strong> — models a timeout
              (e.g. &ldquo;if not completed within 3 days, escalate&rdquo;).
            </li>
            <li>
              <strong>Error boundary event</strong> — catches errors thrown
              by the activity and routes to an error handling path.
            </li>
            <li>
              <strong>Message boundary event</strong> — waits for an
              external message while the activity is running.
            </li>
          </ul>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 17 ── */
  {
    slug: "value-analysis",
    title: "Value Analysis",
    sections: [
      {
        body: (
          <p>
            Value analysis lets you classify each task and subprocess in a
            BPMN diagram as <strong>value-adding</strong>,{" "}
            <strong>necessary but non-value-adding</strong>, or{" "}
            <strong>non-value-adding</strong>. You can also record cycle
            time and wait time for process performance analysis.
          </p>
        ),
      },
      {
        heading: "Setting the value classification",
        body: (
          <>
            <p>
              Select a <strong>task</strong>, <strong>subprocess</strong>, or{" "}
              <strong>expanded subprocess</strong>. In the Properties Panel
              you will see a <strong>Value</strong> section with four buttons:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                <strong>None</strong> — no classification (default)
              </li>
              <li>
                <strong className="text-green-600">VA</strong> — Value Adding
                (shown in green)
              </li>
              <li>
                <strong className="text-orange-500">NNVA</strong> — Necessary
                Non-Value Adding (shown in orange)
              </li>
              <li>
                <strong className="text-red-600">NVA</strong> — Non-Value
                Adding (shown in red)
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: "Cycle time and wait time",
        body: (
          <>
            <p>
              Below the Value buttons you can enter:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                <strong>Cycle Time</strong> — how long the activity takes to
                complete
              </li>
              <li>
                <strong>Wait Time</strong> — how long work waits before this
                activity begins
              </li>
              <li>
                <strong>Time Units</strong> — sec, min, hrs, days, or a
                custom unit
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: "Showing values on the canvas",
        body: (
          <>
            <p>
              To see value badges on the diagram:
            </p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>
                Click <strong>Diagram Settings</strong> in the toolbar.
              </li>
              <li>
                Check the <strong>Value Display</strong> checkbox.
              </li>
            </ol>
            <p className="mt-2">
              When enabled, a coloured badge appears at the bottom-right of
              each classified element showing the classification code
              (VA/NNVA/NVA) and any recorded times (e.g.{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">
                CT=5, WT=2:min
              </code>
              ).
            </p>
          </>
        ),
        image: "/help/images/value-display.png",
        imageAlt: "Value analysis badges on tasks",
        imageCaption: "Tasks showing VA, NNVA, and NVA badges with cycle/wait times.",
      },
    ],
  },

  /* ──────────────────────────────────────────────── 18 ── */
  {
    slug: "bottleneck",
    title: "Bottleneck Highlighting",
    sections: [
      {
        body: (
          <p>
            Bottleneck highlighting lets you visually flag sequence
            connectors that represent capacity constraints or resource
            bottlenecks in a process.
          </p>
        ),
      },
      {
        heading: "Marking a connector as a bottleneck",
        body: (
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Select a <strong>sequence connector</strong> in a BPMN diagram.
            </li>
            <li>
              In the Properties Panel, check the{" "}
              <strong>Bottleneck</strong> checkbox.
            </li>
          </ol>
        ),
      },
      {
        heading: "Enabling bottleneck display",
        body: (
          <>
            <p>
              Bottleneck connectors are only visually distinguished when the
              display is enabled:
            </p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>
                Click <strong>Diagram Settings</strong> in the toolbar.
              </li>
              <li>
                Check the <strong>Bottleneck Display</strong> checkbox.
              </li>
            </ol>
            <p className="mt-2">
              When enabled, connectors marked as bottlenecks are rendered in{" "}
              <strong className="text-purple-600">purple</strong> instead of
              the default colour, making them stand out in the process flow.
            </p>
          </>
        ),
        image: "/help/images/bottleneck.png",
        imageAlt: "Bottleneck connector highlighting",
        imageCaption: "A purple bottleneck connector highlighting a capacity constraint.",
      },
      {
        heading: "When to use bottleneck highlighting",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              Identifying the <strong>constraint</strong> in a process
              (Theory of Constraints)
            </li>
            <li>
              Marking flows with <strong>capacity issues</strong> during
              process review workshops
            </li>
            <li>
              Combining with <strong>Value Analysis</strong> to build a
              complete process performance picture
            </li>
          </ul>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 20 ── */
  {
    slug: "value-chain",
    title: "Value Chain Diagrams",
    sections: [
      {
        body: (
          <p>
            Value chain diagrams model process flows using process shapes.
            They have no connectors — the flow is implied by the
            left-to-right arrangement of processes.
          </p>
        ),
        imageCaption: "A value chain diagram with themed processes inside a Value Chain container.",
      },
      {
        heading: "Process",
        body: (
          <p>
            The primary element. A pentagon-like shape with a notched left
            side and pointed right side. Supports multi-line labels
            (Shift+Enter for new line) and an optional{" "}
            <strong>description box</strong> displayed below.
          </p>
        ),
      },
      {
        heading: "Collapsed Process",
        body: (
          <>
            <p>
              Like a regular process but with a <strong>+</strong> marker
              at the bottom centre (same as a BPMN subprocess). Can be
              linked to another <strong>Value Chain</strong> or{" "}
              <strong>BPMN</strong> diagram in the same project.
            </p>
            <p className="mt-2">
              Double-click the + marker to drill into the linked diagram.
              The marker turns green when linked, grey when unlinked.
            </p>
          </>
        ),
      },
      {
        heading: "Value Chain",
        body: (
          <>
            <p>
              A rectangular container that groups related processes.
              Value chains always render <strong>behind</strong> their
              children.
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                Processes dropped or moved inside a value chain become
                its children and move with it.
              </li>
              <li>
                <strong>Shift+drag</strong> a child to move it outside
                the parent boundary.
              </li>
              <li>
                Nested value chains automatically{" "}
                <strong>lighten in shade</strong> — each level is 25%
                lighter than its parent.
              </li>
              <li>
                Deleting a value chain keeps all children on the diagram.
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: "Description boxes",
        body: (
          <>
            <p>
              Each process has an optional description box displayed below
              it. The description auto-wraps to the process&apos;s width.
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                Toggle visibility with the{" "}
                <strong>Show description</strong> checkbox in the
                Properties Panel (on by default).
              </li>
              <li>
                Edit inline by <strong>double-clicking</strong> the
                description box on the canvas.
              </li>
              <li>
                Use <strong>Shift+Enter</strong> for explicit line breaks.
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: "Horizontal snap",
        body: (
          <p>
            When dragging a process near another process with ≥75% vertical
            overlap, it snaps to align horizontally with a{" "}
            <strong>10px overlap</strong> — creating the classic
            interlocking process chain appearance.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 21 ── */
  {
    slug: "chevron-themes",
    title: "Process Colour Themes",
    sections: [
      {
        body: (
          <p>
            Apply coordinated pastel colour schemes to groups of processes
            for visual distinction between process areas.
          </p>
        ),
      },
      {
        heading: "Applying a theme",
        body: (
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Select <strong>2 or more processes</strong> (click + Shift+click,
              or lasso selection).
            </li>
            <li>
              <strong>Right-click</strong> — a theme picker popup appears
              (instead of the quick-add popup).
            </li>
            <li>
              Click a theme row — colours are applied left-to-right by
              process position.
            </li>
          </ol>
        ),
      },
      {
        heading: "Available themes",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Sunrise</strong> — warm yellows through pinks to blues</li>
            <li><strong>Ocean</strong> — cyans through blues to purples</li>
            <li><strong>Garden</strong> — greens through teals to sky blues</li>
            <li><strong>Berry</strong> — pinks through purples to blues</li>
            <li><strong>Earth</strong> — yellows through peaches to greys</li>
          </ul>
        ),
      },
      {
        heading: "Clearing colours",
        body: (
          <p>
            Select the themed processes, right-click, and choose{" "}
            <strong>Clear Colours</strong> at the bottom of the popup.
            All processes revert to the default diagram colour.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 22 ── */
  {
    slug: "process-context",
    title: "Process Context Diagrams",
    sections: [
      {
        body: (
          <p>
            Process Context diagrams show processes within a{" "}
            <strong>Process Group</strong> boundary, connected to external
            actors, teams, systems, and auto-schedulers. Unlike standard
            Use Case diagrams, these focus on process context with numbered
            process identifiers.
          </p>
        ),
      },
      {
        heading: "Element types",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Use Case</strong> (ellipse) — represents a process.
              AI-generated processes are numbered in P-XX-NN format
              (e.g. P-HR-01, P-FI-02).
            </li>
            <li>
              <strong>Actor</strong> (stick figure) — an individual
              person or role.
            </li>
            <li>
              <strong>Team</strong> (group icon) — a department or
              organisational unit.
            </li>
            <li>
              <strong>System</strong> (monitor icon) — an IT system,
              application, or platform.
            </li>
            <li>
              <strong>Hourglass</strong> (hourglass icon) — an
              auto-scheduler, timer, or time-triggered mechanism.
            </li>
            <li>
              <strong>System Boundary</strong> (rectangle) — the Process
              Group container. Its label must include &ldquo;Process
              Group&rdquo;.
            </li>
          </ul>
        ),
      },
      {
        heading: "AI generation layout",
        body: (
          <>
            <p>
              When generated by AI, the layout engine applies these rules:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                Processes are arranged <strong>one per row</strong>,
                zigzagging left and right to maximise connection space.
              </li>
              <li>
                <strong>Actors and Teams</strong> are placed on the same
                side as their connected processes — left actors for
                left-side processes, right for right-side.
              </li>
              <li>
                <strong>Systems and Hourglasses</strong> default to the
                right side of the boundary.
              </li>
              <li>
                Actors are vertically positioned <strong>between</strong>{" "}
                their connected processes to minimise crossing lines.
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: "Hourglass connectors",
        body: (
          <p>
            When an hourglass (auto-scheduler) is connected to a process,
            the association is automatically set to{" "}
            <strong>open-directed</strong> (open arrowhead) pointing from
            the hourglass toward the process it triggers. All other
            actor/team/system associations are non-directed (no arrows).
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 23 ── */
  {
    slug: "resize",
    title: "Resize Menu",
    sections: [
      {
        body: (
          <p>
            When <strong>2 or more elements</strong> are selected, a{" "}
            <strong>Resize ▾</strong> dropdown appears in the toolbar
            next to the Alignment dropdown.
          </p>
        ),
      },
      {
        heading: "Options",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Resize to Tallest</strong> — all selected elements get the height of the tallest</li>
            <li><strong>Resize to Shortest</strong> — all get the height of the shortest</li>
            <li><strong>Resize to Widest</strong> — all get the width of the widest</li>
            <li><strong>Resize to Thinnest</strong> — all get the width of the thinnest</li>
          </ul>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 23 ── */
  {
    slug: "convert",
    title: "Element Conversion",
    sections: [
      {
        heading: "Task ↔ Subprocess (BPMN)",
        body: (
          <>
            <p>
              In BPMN diagrams, you can convert between a Task and a
              collapsed Subprocess without losing common attributes.
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                Select a <strong>Task</strong> — the Properties Panel shows
                a <strong>→ Subprocess</strong> button.
              </li>
              <li>
                Select a <strong>Subprocess</strong> — the Properties Panel
                shows a <strong>→ Task</strong> button.
              </li>
            </ul>
            <p className="mt-2">
              The element changes type in place. Label, position, size,
              and connectors are preserved. Task→Subprocess clears the
              task type; Subprocess→Task sets task type to None and clears
              the linked diagram.
            </p>
          </>
        ),
      },
      {
        heading: "Event Type conversion (BPMN)",
        body: (
          <>
            <p>
              All BPMN events show an <strong>Event Type</strong> dropdown
              in the Properties Panel with options: Start, Intermediate, End.
              Selecting a different type converts the event in place.
            </p>
            <p className="mt-2">
              Label, position, and connectors are preserved. Invalid triggers
              are cleared on conversion (e.g. Timer cleared when converting
              to End Event, Terminate cleared when converting away from End).
              The former &ldquo;Event Type&rdquo; dropdown is now called{" "}
              <strong>Trigger</strong> (Message, Timer, Error, etc.).
            </p>
          </>
        ),
      },
      {
        heading: "Process ↔ Collapsed Process (Value Chain)",
        body: (
          <>
            <p>
              In Value Chain diagrams, you can convert between a Process
              and a Collapsed Process in the same way.
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                Select a <strong>Process</strong> — the Properties Panel shows
                a <strong>→ Collapsed Process</strong> button.
              </li>
              <li>
                Select a <strong>Collapsed Process</strong> — the Properties Panel
                shows a <strong>→ Process</strong> button.
              </li>
            </ul>
            <p className="mt-2">
              Label, position, size, fill colour, and description are
              preserved. Converting to Process clears the linked diagram.
            </p>
          </>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 24 ── */
  {
    slug: "database-diagrams",
    title: "Database Domain Diagrams",
    sections: [
      {
        body: (
          <p>
            Domain diagrams can be configured as <strong>database schema
            diagrams</strong> by setting a Database type in the Diagram
            Title section. This changes stereotype labels, attribute types,
            and enables database-specific features.
          </p>
        ),
      },
      {
        heading: "Setting the database type",
        body: (
          <ol className="list-decimal list-inside space-y-1">
            <li>
              Click on empty canvas to open the Properties Panel.
            </li>
            <li>
              In the <strong>Diagram Title</strong> section, set the{" "}
              <strong>Database</strong> dropdown to PostgreSQL, MySQL,
              or SQL Server.
            </li>
          </ol>
        ),
      },
      {
        heading: "What changes",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              Entity stereotype changes from{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">
                &laquo;entity&raquo;
              </code>{" "}
              to{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">
                &laquo;table&raquo;
              </code>
            </li>
            <li>
              Attribute <strong>Type</strong> dropdown shows
              database-specific types (e.g. TEXT, TIMESTAMPTZ for
              PostgreSQL; NVARCHAR, DATETIME2 for SQL Server; VARCHAR,
              ENUM for MySQL)
            </li>
            <li>
              New attribute flags: <strong>NOT NULL</strong> (shows [1]
              multiplicity), <strong>PK</strong> (shows &#123;PK&#125;),{" "}
              <strong>FK</strong> (shows &#123;FK &rarr; table.column&#125;)
            </li>
            <li>
              Red connector obstacle warnings are disabled
            </li>
            <li>
              Database name shown in diagram title block
            </li>
          </ul>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 25 ── */
  {
    slug: "import-ddl",
    title: "Import DDL",
    sections: [
      {
        body: (
          <p>
            Import a SQL Data Definition Language file to automatically
            create a Domain Diagram with tables, enumerations, foreign
            key relationships, and multiplicities.
          </p>
        ),
      },
      {
        heading: "How to import",
        body: (
          <ol className="list-decimal list-inside space-y-2">
            <li>
              On the Dashboard, click <strong>File ▾ → Import DDL</strong>.
            </li>
            <li>
              Choose a <strong>Database Type</strong> (PostgreSQL, MySQL,
              or SQL Server).
            </li>
            <li>
              Enter a <strong>Project Name</strong> (a new project will
              be created).
            </li>
            <li>
              Optionally enter a <strong>Diagram Name</strong>.
            </li>
            <li>
              Select a <strong>.sql</strong> or <strong>.ddl</strong> file.
            </li>
            <li>
              Click <strong>Import</strong>.
            </li>
          </ol>
        ),
      },
      {
        heading: "What gets created",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              A new project with a Domain Diagram set to the chosen
              database type
            </li>
            <li>
              <strong>Tables</strong> as UML classes with{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">
                &laquo;table&raquo;
              </code>{" "}
              stereotype, all columns as attributes with PK/FK/NOT NULL markers
            </li>
            <li>
              <strong>Lookup tables</strong> (single-column with INSERTs)
              as UML enumerations
            </li>
            <li>
              <strong>Association connectors</strong> for every foreign
              key, with multiplicities (* → 1)
            </li>
          </ul>
        ),
      },
      {
        heading: "Supported SQL dialects",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>PostgreSQL</strong> — TEXT, SERIAL, TIMESTAMPTZ,
              JSONB, UUID, etc.
            </li>
            <li>
              <strong>MySQL</strong> — backtick identifiers,
              AUTO_INCREMENT, ENUM, DATETIME, BLOB variants
            </li>
            <li>
              <strong>SQL Server</strong> — [bracket] identifiers,
              IDENTITY, NVARCHAR, BIT, DATETIME2, GO terminators
            </li>
          </ul>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 26 ── */
  {
    slug: "generate-ddl",
    title: "Generate DDL",
    adminOnly: true,
    sections: [
      {
        body: (
          <p>
            Administrators can generate the complete Diagramatix
            relational database schema as a SQL DDL file for any
            supported database type.
          </p>
        ),
      },
      {
        heading: "How to generate",
        body: (
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Go to <strong>File ▾ → Admin</strong> on the Dashboard.
            </li>
            <li>
              Click <strong>Generate Diagramatix DDL</strong>.
            </li>
            <li>
              Choose a <strong>Database Type</strong> (PostgreSQL, MySQL,
              or SQL Server).
            </li>
            <li>
              Click <strong>Download</strong> — the DDL file is saved
              with dialect-appropriate syntax.
            </li>
          </ol>
        ),
      },
      {
        heading: "What the DDL contains",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>29 reference/lookup tables with seed INSERT data</li>
            <li>22 entity tables with full column definitions</li>
            <li>All foreign keys, indexes, and unique constraints</li>
            <li>No JSON columns — fully normalised relational schema</li>
            <li>Schema version number in header comment</li>
          </ul>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 27 ── */
  {
    slug: "account",
    title: "Account Settings",
    sections: [
      {
        body: (
          <p>
            Click your <strong>name and email</strong> in the dashboard
            header to open Account Settings.
          </p>
        ),
      },
      {
        heading: "Profile",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Name</strong> — your display name shown across the
              application.
            </li>
            <li>
              <strong>Email</strong> — your sign-in email address.
              Changing this updates your credentials immediately.
            </li>
          </ul>
        ),
      },
      {
        heading: "Organisation",
        body: (
          <p>
            Edit your <strong>Organisation Name</strong>. This is the
            name shown in the dashboard header and used to identify your
            workspace.
          </p>
        ),
      },
      {
        heading: "Change Password",
        body: (
          <ol className="list-decimal list-inside space-y-1">
            <li>Enter your <strong>current password</strong>.</li>
            <li>Enter a <strong>new password</strong> (minimum 6 characters).</li>
            <li>Confirm the new password.</li>
            <li>Click <strong>Save</strong>.</li>
          </ol>
        ),
      },
      {
        heading: "Sign Out",
        body: (
          <p>
            The <strong>Sign Out</strong> button is in the Account Settings
            dialog footer.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 28 ── */
  {
    slug: "ai-generate",
    title: "AI Diagram Generation",
    sections: [
      {
        body: (
          <p>
            Generate diagrams from natural language descriptions using AI.
            Available for all diagram types via the{" "}
            <strong>AI Generate</strong> button in the diagram editor toolbar.
          </p>
        ),
      },
      {
        heading: "Prompt input",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              Type a description of the process, system, or model you want
              to create in the prompt textarea.
            </li>
            <li>
              <strong>Dictate</strong> — click the microphone button to
              speak your prompt (Chrome/Edge/Safari). Speech is appended
              to existing text.
            </li>
            <li>
              <strong>Attach a document</strong> — click <strong>Attach</strong>{" "}
              to upload a file that describes the diagram. Supported formats:
              PDF (native document understanding), TXT, MD, CSV, RTF.
              Max 10MB. The document content is sent to the AI alongside
              your prompt.
            </li>
          </ul>
        ),
      },
      {
        heading: "Replace vs Add",
        body: (
          <p>
            <strong>Replace</strong> clears the current diagram and replaces
            it with the AI-generated result. <strong>Add to diagram</strong>{" "}
            appends the generated elements alongside existing content.
            Both are undoable with Ctrl+Z.
          </p>
        ),
      },
      {
        heading: "Saved prompts",
        body: (
          <ul className="list-disc list-inside space-y-1">
            <li>
              Click <strong>Save</strong> to save the current prompt for
              reuse. Prompts are filtered by diagram type — each type
              shows only its own saved prompts.
            </li>
            <li>
              Click a saved prompt to load it. The panel enters{" "}
              <strong>edit mode</strong> — modify the text and click{" "}
              <strong>Update</strong> to save changes, or{" "}
              <strong>New</strong> to save as a fresh prompt.
            </li>
            <li>
              Delete prompts with the <strong>&times;</strong> button
              (requires confirmation).
            </li>
            <li>
              Manage all prompts from{" "}
              <strong>System &rarr; AI Prompt Maintenance</strong> on the
              Dashboard.
            </li>
          </ul>
        ),
      },
      {
        heading: "AI Rules & Preferences",
        body: (
          <p>
            Admins can configure rules that guide AI generation for each
            diagram type via{" "}
            <strong>File &rarr; Admin &rarr; AI Rules &amp; Preferences</strong>.
            Rules are grouped and colour-coded:{" "}
            <span className="text-green-600 font-medium">green</span> rules
            are enforced by the AI model,{" "}
            <span className="text-red-600 font-medium">red</span> rules
            (under Layout groups) are implemented in the layout engine code.
          </p>
        ),
      },
    ],
  },

  /* ──────────────────────────────────────────────── 29 ── */
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
