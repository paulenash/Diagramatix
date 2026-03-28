const ExcelJS = require("exceljs");
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Diagramatix Changelog");

sheet.columns = [
  { header: "Version", key: "version", width: 12 },
  { header: "Date", key: "date", width: 14 },
  { header: "Feature / Improvement", key: "feature", width: 40 },
  { header: "Description", key: "description", width: 80 },
];

const headerRow = sheet.getRow(1);
headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
headerRow.alignment = { vertical: "middle", horizontal: "center" };

const data = [
  ["1.0.1","2026-03-03","MVP Generated Code","Initial MVP codebase generated with Next.js 16, Prisma 7, Auth.js v5, SVG canvas"],
  ["1.0.3","2026-03-05","First Running Version","Application compiles and runs for the first time"],
  ["1.0.4","2026-03-05","Drag & Drop Connectors","Text background and drag-and-drop connector creation"],
  ["1.0.5","2026-03-05","Connector Types","Added Side, DirectionType, RoutingType to types; extended Connector model"],
  ["1.0.6","2026-03-05","Curvilinear Routing","State Machine diagrams use smooth cubic bezier connectors with perpendicular exit/entry"],
  ["1.0.7","2026-03-05","Symbol Refinements","Hourglass resize, Process Group rename, Actor to Participant rename, Team figures"],
  ["1.0.8","2026-03-05","AutoTimer & Centre Connectors","AutoTimer label below element, all connectors route to centre"],
  ["1.0.14","2026-03-06","State Machine Fixes","Final State label suppression, initial state improvements"],
  ["1.0.18","2026-03-07","BPMN Task Subtypes","User, Service, Script, Send, Receive, Manual, Business Rule task markers"],
  ["1.0.21","2026-03-07","Floating Labels","Event and gateway elements get floating labels below"],
  ["1.0.23","2026-03-07","Corner Insertion","Connector corner insertion for waypoint editing"],
  ["1.0.25","2026-03-07","Task/Subprocess Resize","Resize handles for task and subprocess elements"],
  ["1.0.33","2026-03-07","Rounded Corners","Rectilinear connectors with rounded corner arcs (8px radius)"],
  ["1.0.35","2026-03-07","Split Connector","Drop element on connector to split it with auto-reconnection"],
  ["1.0.38","2026-03-07","Intermediate Event Picker","Dropdown to select event marker type on creation"],
  ["1.0.40","2026-03-08","Data Object & Data Store","New Data Object and Data Store BPMN symbols"],
  ["1.0.42","2026-03-08","Association BPMN Connector","Association connector type with thin open arrowheads"],
  ["1.0.46","2026-03-08","Pools & Lanes","Complete Pool and Lane implementation for BPMN"],
  ["1.0.50","2026-03-08","Cross-Pool Messaging","messageBPMN connector creation between pools"],
  ["1.0.56","2026-03-08","Lane Selection & Delete","Lanes selectable and deletable with content protection"],
  ["1.0.62","2026-03-08","Expanded Subprocess","New Expanded Subprocess element with child containment"],
  ["1.0.67","2026-03-09","Data Store Visual Rework","Stacked platters visual style for data stores"],
  ["1.0.70","2026-03-09","Boundary Events","Boundary events attached to element edges"],
  ["1.0.76","2026-03-09","Transition Auto-numbering","Transitions renamed and auto-numbered"],
  ["1.0.81","2026-03-09","End Event Connections","End events can now be connector sources and targets"],
  ["1.0.86","2026-03-10","Flow Types","Added FlowType (catching/throwing) for intermediate events"],
  ["1.0.91","2026-03-10","Delete Key Only","Backspace no longer triggers deletion; Delete key only"],
  ["1.0.97","2026-03-10","Curvilinear Control Points","Curve handle drag with control point offsets stored per connector"],
  ["1.0.99","2026-03-10","Composite State","Composite state containment for state machine diagrams"],
  ["1.0.101","2026-03-10","Group Element","Group element with dashed-dotted border for BPMN"],
  ["1.0.105","2026-03-11","Text Annotation","Text annotations with open bracket and auto-width"],
  ["1.0.111","2026-03-11","Diagram Maintenance","Diagram colour maintenance modal with per-symbol colours"],
  ["1.0.117","2026-03-11","Project Colour Config","Project-level colour configuration persisted to database"],
  ["1.0.119","2026-03-12","Black & White Mode","Black & White colour scheme option in Diagram Maintenance"],
  ["1.0.121","2026-03-12","Diagram Thumbnails","Miniature diagram previews on project tiles"],
  ["1.0.123","2026-03-12","Diagram-Level Colours","Per-diagram colour configuration overriding project colours"],
  ["1.0.127","2026-03-13","Hand-Drawn Mode","Hand-drawn display mode with SVG displacement filter and italic text"],
  ["1.0.133","2026-03-13","PDF Export","Vector-quality PDF export with jspdf + svg2pdf.js"],
  ["1.0.135","2026-03-14","PDF Scale Options","PDF export with 100%, 75%, 50%, 25% scale options"],
  ["1.0.137","2026-03-14","Diagram Type Colours","Diagram Maintenance shows only current diagram type colours"],
  ["1.0.146","2026-03-16","Diagram Templates","User and built-in BPMN templates with save/load/delete"],
  ["1.0.150","2026-03-18","Email Authentication","Gmail SMTP credentials for password reset emails"],
  ["1.0.151","2026-03-18","Template Edit","Edit existing templates with overwrite capability"],
  ["1.0.153","2026-03-18","Smart Alignment","Multi-element alignment with boundary event following"],
  ["1.0.156","2026-03-18","Built-in Templates","Two template categories: user and built-in (admin-managed)"],
  ["1.0.158","2026-03-18","Lane Selection Highlight","Blue dashed outline for selected lanes/pools"],
  ["1.0.159","2026-03-18","Connector Crossing Humps","Only later-added connector shows hump at crossing points"],
  ["1.0.163","2026-03-19","Call Subprocess Style","Single thick border (4px) for Call subprocess type"],
  ["1.0.164","2026-03-19","New Event Types","Escalation, Cancel, Compensation, Link event types with markers"],
  ["1.0.166","2026-03-19","Sub-lanes","Sub-lanes within lanes with draggable boundaries"],
  ["1.0.168","2026-03-20","Centre Zoom","Zoom now anchors on canvas centre rather than mouse position"],
  ["1.0.170","2026-03-21","Context Diagrams","Context diagram type with external entities, processes, data flows"],
  ["1.0.174","2026-03-21","Endpoint Nudging","Arrow key nudging for connector endpoints with click-to-focus"],
  ["1.0.179","2026-03-22","Domain Diagrams","UML class diagrams with classes, enumerations, and relationships"],
  ["1.0.183","2026-03-23","Transition Labels","Formal transition labels with event[guard]/actions format"],
  ["1.0.184","2026-03-23","Diagram Title","Title block with version, authors, status, created/modified dates"],
  ["1.0.186","2026-03-23","Auto Zoom-to-Fit","Diagrams auto-zoom to fit all elements on open"],
  ["1.0.190","2026-03-23","Font Size Controls","Independent font size controls for elements, connectors, and title"],
  ["1.0.197","2026-03-23","Version Display","Dashboard shows app version number"],
  ["1.0.199","2026-03-23","Element Resize Improvements","Improved resize for Task, Subprocess, State, Composite State"],
  ["1.0.203","2026-03-24","Folder Tree Navigation","Project folder tree with drag-drop diagram organisation"],
  ["1.0.204","2026-03-24","Resizable Nav Panel","Navigation panel width is draggable and persisted"],
  ["1.0.210","2026-03-24","UML Association Endpoints","Association end role, multiplicity, visibility, constraints"],
  ["1.0.220","2026-03-25","UML Multiplicity Presets","Multiplicity dropdown with presets and custom n..m input"],
  ["1.0.222","2026-03-26","UML Class Attributes","Attributes and operations compartments in UML classes"],
  ["1.0.229","2026-03-26","Project Export (JSON)","Export entire project with diagrams, settings, folder structure"],
  ["1.0.231","2026-03-26","Project Import","Import project from JSON with folder tree remapping"],
  ["1.0.232","2026-03-27","XSD Schema","XML Schema Definition for export format validation"],
  ["1.0.233","2026-03-27","XML Export","Export project as XML with namespace and XSD reference"],
  ["1.0.234","2026-03-27","Dynamic XSD API","XSD served via /api/schema with runtime version injection"],
  ["1.0.235","2026-03-27","Dual Versioning","Separate schemaVersion and appVersion in exports"],
  ["1.0.236","2026-03-27","Superuser Impersonation","Admin can view other users profiles with read-only orange background"],
  ["1.0.238","2026-03-27","Subprocess Linking","Link collapsed subprocesses to other BPMN diagrams with drill-down navigation"],
  ["1.0.241","2026-03-27","Drill-Down Navigation","SessionStorage navigation stack for subprocess drill-down and return"],
  ["1.0.242","2026-03-27","Dashboard UI Compaction","Compact project/diagram tiles, Import in header, 4-column grid"],
  ["1.0.243","2026-03-28","Folder Tree to Database","Project folder structure persisted in database instead of localStorage"],
  ["1.0.244","2026-03-28","Caching Improvements","router.back() for cached returns, 30s dynamic cache, sequential API calls"],
  ["1.0.245","2026-03-28","PGlite Connection Fix","Reduced pool sizes (max:2) to prevent connection exhaustion and timeouts"],
  ["1.0.246","2026-03-28","Refresh Button","Database refresh button in dashboard header clears cache and re-fetches"],
  ["1.0.247","2026-03-28","Drag-Drop to Project","Drag unorganised diagrams onto project tiles with name clash handling"],
  ["1.0.248","2026-03-28","Confirm Delete Dialogs","Custom modal confirmation dialogs for all delete operations"],
  ["1.0.249","2026-03-28","System Archive","Deleted diagrams archived with original owner/project metadata and admin restore"],
];

data.forEach(([version, date, feature, description]) => {
  sheet.addRow({ version, date, feature, description });
});

sheet.autoFilter = "A1:D1";
sheet.getColumn("description").alignment = { wrapText: true, vertical: "top" };
sheet.getColumn("feature").alignment = { vertical: "top" };

workbook.xlsx.writeFile("private/Diagramatix-Changelog.xlsx").then(() => {
  console.log("Written: private/Diagramatix-Changelog.xlsx");
  console.log(data.length + " entries");
});
