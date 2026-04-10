-- ============================================================================
-- Diagramatix Relational Database Schema (DDL)
-- Schema Version: 1.5
-- Generated: 2026-04-11
--
-- Fully relational expansion of the Diagramatix data model.
-- No JSON columns — all structured data is normalised into tables.
-- All choice lists are reference tables with INSERT seed data.
-- PostgreSQL dialect.
-- ============================================================================

-- ============================================================================
-- REFERENCE / LOOKUP TABLES
-- ============================================================================

CREATE TABLE ref_org_entity_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_org_entity_type (code) VALUES
    ('ADI'), ('Insurer'), ('LifeInsurer'), ('HealthInsurer'), ('RSE'), ('Other');

CREATE TABLE ref_org_role (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_org_role (code) VALUES
    ('Owner'), ('Admin'), ('RiskOwner'), ('ProcessOwner'),
    ('ControlOwner'), ('InternalAudit'), ('BoardObserver'), ('Viewer');

CREATE TABLE ref_diagram_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_diagram_type (code) VALUES
    ('context'), ('basic'), ('process-context'), ('state-machine'),
    ('bpmn'), ('domain'), ('value-chain');

CREATE TABLE ref_symbol_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_symbol_type (code) VALUES
    ('task'), ('gateway'), ('start-event'), ('intermediate-event'), ('end-event'),
    ('use-case'), ('actor'), ('team'), ('state'), ('initial-state'), ('final-state'),
    ('pool'), ('lane'), ('subprocess'), ('subprocess-expanded'),
    ('system-boundary'), ('system-boundary-body'), ('hourglass'),
    ('composite-state'), ('composite-state-body'), ('system'),
    ('data-object'), ('data-store'), ('group'), ('text-annotation'),
    ('external-entity'), ('process-system'), ('uml-class'), ('uml-enumeration'),
    ('sublane'), ('fork-join'), ('submachine'),
    ('chevron'), ('chevron-collapsed'), ('process-group');

CREATE TABLE ref_bpmn_task_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_bpmn_task_type (code) VALUES
    ('none'), ('user'), ('service'), ('script'),
    ('send'), ('receive'), ('manual'), ('business-rule');

CREATE TABLE ref_gateway_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_gateway_type (code) VALUES
    ('none'), ('exclusive'), ('inclusive'), ('parallel'), ('event-based');

CREATE TABLE ref_gateway_role (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_gateway_role (code) VALUES
    ('decision'), ('merge');

CREATE TABLE ref_event_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_event_type (code) VALUES
    ('none'), ('message'), ('timer'), ('error'), ('signal'), ('terminate'),
    ('conditional'), ('escalation'), ('cancel'), ('compensation'), ('link');

CREATE TABLE ref_repeat_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_repeat_type (code) VALUES
    ('none'), ('loop'), ('mi-sequential'), ('mi-parallel');

CREATE TABLE ref_flow_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_flow_type (code) VALUES
    ('none'), ('catching'), ('throwing');

CREATE TABLE ref_connector_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_connector_type (code) VALUES
    ('sequence'), ('message'), ('association'), ('transition'),
    ('associationBPMN'), ('messageBPMN'), ('flow'),
    ('uml-association'), ('uml-aggregation'), ('uml-composition'), ('uml-generalisation');

CREATE TABLE ref_side (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_side (code) VALUES
    ('top'), ('right'), ('bottom'), ('left');

CREATE TABLE ref_direction_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_direction_type (code) VALUES
    ('directed'), ('non-directed'), ('open-directed'), ('both');

CREATE TABLE ref_routing_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_routing_type (code) VALUES
    ('direct'), ('rectilinear'), ('curvilinear');

CREATE TABLE ref_diagram_status (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_diagram_status (code) VALUES
    ('draft'), ('final'), ('production');

CREATE TABLE ref_display_mode (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_display_mode (code) VALUES
    ('normal'), ('hand-drawn');

CREATE TABLE ref_label_anchor (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_label_anchor (code) VALUES
    ('midpoint'), ('source');

CREATE TABLE ref_label_mode (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_label_mode (code) VALUES
    ('informal'), ('formal');

CREATE TABLE ref_reading_direction (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_reading_direction (code) VALUES
    ('none'), ('to-source'), ('to-target');

CREATE TABLE ref_pool_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_pool_type (code) VALUES
    ('black-box'), ('white-box');

CREATE TABLE ref_subprocess_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_subprocess_type (code) VALUES
    ('normal'), ('call'), ('event'), ('transaction');

CREATE TABLE ref_interruption_type (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_interruption_type (code) VALUES
    ('interrupting'), ('non-interrupting');

CREATE TABLE ref_annotation_color (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_annotation_color (code) VALUES
    ('black'), ('green'), ('orange'), ('red'), ('purple');

CREATE TABLE ref_annotation_font_style (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_annotation_font_style (code) VALUES
    ('normal'), ('italic');

CREATE TABLE ref_value_analysis (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_value_analysis (code) VALUES
    ('none'), ('VA'), ('NNVA'), ('NVA');

CREATE TABLE ref_time_unit (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_time_unit (code) VALUES
    ('none'), ('sec'), ('min'), ('hrs'), ('days'), ('other');

CREATE TABLE ref_uml_visibility (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_uml_visibility (code) VALUES
    ('+'), ('-'), ('#');

CREATE TABLE ref_data_role (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_data_role (code) VALUES
    ('none'), ('input'), ('output');

CREATE TABLE ref_data_multiplicity (
    code  TEXT PRIMARY KEY
);
INSERT INTO ref_data_multiplicity (code) VALUES
    ('single'), ('collection');


-- ============================================================================
-- CORE ENTITY TABLES
-- ============================================================================

CREATE TABLE org (
    id           TEXT        PRIMARY KEY,
    name         TEXT        NOT NULL,
    entity_type  TEXT        NOT NULL DEFAULT 'Other'
                             REFERENCES ref_org_entity_type(code),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_user (
    id                 TEXT        PRIMARY KEY,
    email              TEXT        NOT NULL UNIQUE,
    name               TEXT,
    password           TEXT        NOT NULL DEFAULT '',
    reset_token        TEXT        UNIQUE,
    reset_token_expiry TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE org_member (
    id         TEXT        PRIMARY KEY,
    org_id     TEXT        NOT NULL REFERENCES org(id) ON DELETE CASCADE,
    user_id    TEXT        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role       TEXT        NOT NULL REFERENCES ref_org_role(code),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, user_id)
);
CREATE INDEX idx_org_member_user ON org_member(user_id);

CREATE TABLE project (
    id          TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    owner_name  TEXT        NOT NULL DEFAULT '',
    user_id     TEXT        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    org_id      TEXT        NOT NULL REFERENCES org(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_project_org ON project(org_id);

CREATE TABLE diagram (
    id           TEXT        PRIMARY KEY,
    name         TEXT        NOT NULL,
    type         TEXT        NOT NULL DEFAULT 'basic'
                             REFERENCES ref_diagram_type(code),
    display_mode TEXT        NOT NULL DEFAULT 'normal'
                             REFERENCES ref_display_mode(code),
    user_id      TEXT        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    project_id   TEXT        REFERENCES project(id) ON DELETE SET NULL,
    org_id       TEXT        NOT NULL REFERENCES org(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_diagram_org ON diagram(org_id);

CREATE TABLE diagram_template (
    id            TEXT        PRIMARY KEY,
    name          TEXT        NOT NULL,
    diagram_type  TEXT        NOT NULL DEFAULT 'bpmn'
                              REFERENCES ref_diagram_type(code),
    template_type TEXT        NOT NULL DEFAULT 'user',
    user_id       TEXT        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- DIAGRAM SETTINGS & TITLE  (from DiagramData top-level fields)
-- ============================================================================

CREATE TABLE diagram_settings (
    diagram_id          TEXT    PRIMARY KEY REFERENCES diagram(id) ON DELETE CASCADE,
    viewport_x          NUMERIC NOT NULL DEFAULT 0,
    viewport_y          NUMERIC NOT NULL DEFAULT 0,
    viewport_zoom       NUMERIC NOT NULL DEFAULT 1,
    font_size           NUMERIC DEFAULT 12,
    connector_font_size NUMERIC DEFAULT 10,
    title_font_size     NUMERIC DEFAULT 14
);

CREATE TABLE diagram_title (
    diagram_id  TEXT    PRIMARY KEY REFERENCES diagram(id) ON DELETE CASCADE,
    version     TEXT,
    authors     TEXT,
    status      TEXT    REFERENCES ref_diagram_status(code),
    show_title  BOOLEAN DEFAULT FALSE
);


-- ============================================================================
-- ELEMENTS  (from DiagramData.elements[])
-- ============================================================================

CREATE TABLE element (
    id               TEXT    PRIMARY KEY,
    diagram_id       TEXT    NOT NULL REFERENCES diagram(id) ON DELETE CASCADE,
    type             TEXT    NOT NULL REFERENCES ref_symbol_type(code),
    x                NUMERIC NOT NULL,
    y                NUMERIC NOT NULL,
    width            NUMERIC NOT NULL,
    height           NUMERIC NOT NULL,
    label            TEXT    NOT NULL DEFAULT '',
    parent_id        TEXT,                    -- FK to element.id (self-ref for nesting)
    boundary_host_id TEXT,                    -- FK to element.id (boundary event on host)

    -- BPMN type-specific fields
    task_type        TEXT    REFERENCES ref_bpmn_task_type(code),
    gateway_type     TEXT    REFERENCES ref_gateway_type(code),
    event_type       TEXT    REFERENCES ref_event_type(code),
    repeat_type      TEXT    REFERENCES ref_repeat_type(code),
    flow_type        TEXT    REFERENCES ref_flow_type(code),

    -- BPMN element properties (expanded from properties JSON)
    gateway_role         TEXT    REFERENCES ref_gateway_role(code),
    pool_type            TEXT    REFERENCES ref_pool_type(code),
    subprocess_type      TEXT    REFERENCES ref_subprocess_type(code),
    interruption_type    TEXT    REFERENCES ref_interruption_type(code),
    ad_hoc               BOOLEAN,
    linked_diagram_id    TEXT,                 -- FK to diagram.id (drill-down)
    data_role            TEXT    REFERENCES ref_data_role(code),
    data_multiplicity    TEXT    REFERENCES ref_data_multiplicity(code),
    data_state           TEXT,                 -- data object state badge text

    -- Label positioning (gateway/event/data external labels)
    label_offset_x       NUMERIC,
    label_offset_y       NUMERIC,
    label_width          NUMERIC,

    -- Value analysis (task/subprocess)
    value_analysis       TEXT    REFERENCES ref_value_analysis(code),
    cycle_time           NUMERIC,
    wait_time            NUMERIC,
    time_unit            TEXT    REFERENCES ref_time_unit(code),
    time_unit_custom     TEXT,

    -- Text annotation properties
    annotation_color      TEXT   REFERENCES ref_annotation_color(code),
    annotation_font_style TEXT   REFERENCES ref_annotation_font_style(code),

    -- UML class/enumeration properties
    stereotype            TEXT,
    show_stereotype       BOOLEAN,
    show_attributes       BOOLEAN,
    show_operations       BOOLEAN,

    -- Value-chain (chevron) properties
    fill_color            TEXT,                -- per-element hex colour from theme
    description           TEXT,                -- chevron description text
    show_description      BOOLEAN
);
CREATE INDEX idx_element_diagram ON element(diagram_id);

-- Self-referential FKs (deferred to avoid ordering issues)
ALTER TABLE element ADD CONSTRAINT fk_element_parent
    FOREIGN KEY (parent_id) REFERENCES element(id) ON DELETE SET NULL;
ALTER TABLE element ADD CONSTRAINT fk_element_boundary_host
    FOREIGN KEY (boundary_host_id) REFERENCES element(id) ON DELETE CASCADE;
ALTER TABLE element ADD CONSTRAINT fk_element_linked_diagram
    FOREIGN KEY (linked_diagram_id) REFERENCES diagram(id) ON DELETE SET NULL;


-- ============================================================================
-- UML ATTRIBUTES, OPERATIONS, ENUM VALUES  (from element.properties)
-- ============================================================================

CREATE TABLE uml_attribute (
    id              BIGSERIAL PRIMARY KEY,
    element_id      TEXT      NOT NULL REFERENCES element(id) ON DELETE CASCADE,
    ordinal         INT       NOT NULL,       -- display order (0-based)
    visibility      TEXT      REFERENCES ref_uml_visibility(code),
    name            TEXT      NOT NULL,
    type            TEXT,
    multiplicity    TEXT,
    default_value   TEXT,
    property_string TEXT,                      -- e.g. "{ordered}", "{unique}"
    is_derived      BOOLEAN   DEFAULT FALSE
);
CREATE INDEX idx_uml_attr_element ON uml_attribute(element_id);

CREATE TABLE uml_operation (
    id          BIGSERIAL PRIMARY KEY,
    element_id  TEXT      NOT NULL REFERENCES element(id) ON DELETE CASCADE,
    ordinal     INT       NOT NULL,
    visibility  TEXT      REFERENCES ref_uml_visibility(code),
    name        TEXT      NOT NULL
);
CREATE INDEX idx_uml_op_element ON uml_operation(element_id);

CREATE TABLE uml_enum_value (
    id          BIGSERIAL PRIMARY KEY,
    element_id  TEXT      NOT NULL REFERENCES element(id) ON DELETE CASCADE,
    ordinal     INT       NOT NULL,
    value       TEXT      NOT NULL
);
CREATE INDEX idx_uml_enum_element ON uml_enum_value(element_id);


-- ============================================================================
-- CONNECTORS  (from DiagramData.connectors[])
-- ============================================================================

CREATE TABLE connector (
    id                       TEXT    PRIMARY KEY,
    diagram_id               TEXT    NOT NULL REFERENCES diagram(id) ON DELETE CASCADE,
    source_id                TEXT    NOT NULL REFERENCES element(id) ON DELETE CASCADE,
    target_id                TEXT    NOT NULL REFERENCES element(id) ON DELETE CASCADE,
    type                     TEXT    NOT NULL REFERENCES ref_connector_type(code),
    direction_type           TEXT    NOT NULL REFERENCES ref_direction_type(code),
    routing_type             TEXT    NOT NULL REFERENCES ref_routing_type(code),
    source_side              TEXT    NOT NULL REFERENCES ref_side(code),
    target_side              TEXT    NOT NULL REFERENCES ref_side(code),
    source_invisible_leader  BOOLEAN NOT NULL DEFAULT FALSE,
    target_invisible_leader  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Offset along side (0..1)
    source_offset_along      NUMERIC,
    target_offset_along      NUMERIC,

    -- Curvilinear control point offsets (relative to edge point)
    cp1_rel_offset_x         NUMERIC,
    cp1_rel_offset_y         NUMERIC,
    cp2_rel_offset_x         NUMERIC,
    cp2_rel_offset_y         NUMERIC,

    -- Label
    label                    TEXT,
    label_offset_x           NUMERIC,
    label_offset_y           NUMERIC,
    label_width              NUMERIC,
    label_anchor             TEXT    REFERENCES ref_label_anchor(code),

    -- State-machine formal transition label
    label_mode               TEXT    REFERENCES ref_label_mode(code),
    transition_event         TEXT,
    transition_guard         TEXT,
    transition_actions       TEXT,

    -- UML source-end properties
    source_role              TEXT,
    source_multiplicity      TEXT,
    source_property_string   TEXT,
    source_ordered           BOOLEAN,
    source_unique            BOOLEAN,
    source_visibility        TEXT    REFERENCES ref_uml_visibility(code),
    source_qualifier         TEXT,
    source_role_offset_x     NUMERIC,
    source_role_offset_y     NUMERIC,
    source_mult_offset_x     NUMERIC,
    source_mult_offset_y     NUMERIC,
    source_constraint_offset_x NUMERIC,
    source_constraint_offset_y NUMERIC,
    source_unique_offset_x   NUMERIC,
    source_unique_offset_y   NUMERIC,

    -- UML target-end properties
    target_role              TEXT,
    target_multiplicity      TEXT,
    target_property_string   TEXT,
    target_ordered           BOOLEAN,
    target_unique            BOOLEAN,
    target_visibility        TEXT    REFERENCES ref_uml_visibility(code),
    target_qualifier         TEXT,
    target_role_offset_x     NUMERIC,
    target_role_offset_y     NUMERIC,
    target_mult_offset_x     NUMERIC,
    target_mult_offset_y     NUMERIC,
    target_constraint_offset_x NUMERIC,
    target_constraint_offset_y NUMERIC,
    target_unique_offset_x   NUMERIC,
    target_unique_offset_y   NUMERIC,

    -- UML association name
    association_name         TEXT,
    reading_direction        TEXT    REFERENCES ref_reading_direction(code),
    association_name_offset_x NUMERIC,
    association_name_offset_y NUMERIC,

    -- Special flags
    arrow_at_source          BOOLEAN,
    bottleneck               BOOLEAN
);
CREATE INDEX idx_connector_diagram ON connector(diagram_id);


-- ============================================================================
-- CONNECTOR WAYPOINTS  (ordered list of points)
-- ============================================================================

CREATE TABLE connector_waypoint (
    id           BIGSERIAL PRIMARY KEY,
    connector_id TEXT      NOT NULL REFERENCES connector(id) ON DELETE CASCADE,
    ordinal      INT       NOT NULL,          -- 0-based order
    x            NUMERIC   NOT NULL,
    y            NUMERIC   NOT NULL
);
CREATE INDEX idx_wp_connector ON connector_waypoint(connector_id);


-- ============================================================================
-- COLOUR CONFIGURATION  (from Project.colorConfig / Diagram.colorConfig)
-- ============================================================================

CREATE TABLE project_color (
    id          BIGSERIAL PRIMARY KEY,
    project_id  TEXT      NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    symbol_type TEXT      NOT NULL REFERENCES ref_symbol_type(code),
    color       TEXT      NOT NULL,           -- hex colour string e.g. "#fef9c3"
    UNIQUE (project_id, symbol_type)
);

CREATE TABLE diagram_color (
    id          BIGSERIAL PRIMARY KEY,
    diagram_id  TEXT      NOT NULL REFERENCES diagram(id) ON DELETE CASCADE,
    symbol_type TEXT      NOT NULL REFERENCES ref_symbol_type(code),
    color       TEXT      NOT NULL,
    UNIQUE (diagram_id, symbol_type)
);


-- ============================================================================
-- PROJECT FOLDER TREE  (from Project.folderTree)
-- ============================================================================

CREATE TABLE project_folder (
    id          TEXT    NOT NULL,              -- folder ID (e.g. "f-17123...")
    project_id  TEXT    NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    parent_id   TEXT,                          -- NULL = project root level
    collapsed   BOOLEAN DEFAULT FALSE,
    ordinal     INT,                           -- display order within parent
    PRIMARY KEY (project_id, id)
);

CREATE TABLE diagram_folder_map (
    diagram_id  TEXT    NOT NULL REFERENCES diagram(id) ON DELETE CASCADE,
    project_id  TEXT    NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    folder_id   TEXT    NOT NULL DEFAULT 'root', -- "root" = project root level
    ordinal     INT,                           -- display order within folder
    PRIMARY KEY (diagram_id)
);


-- ============================================================================
-- TEMPLATE ELEMENTS & CONNECTORS  (from DiagramTemplate.data)
-- ============================================================================

CREATE TABLE template_element (
    id               TEXT    PRIMARY KEY,
    template_id      TEXT    NOT NULL REFERENCES diagram_template(id) ON DELETE CASCADE,
    type             TEXT    NOT NULL REFERENCES ref_symbol_type(code),
    x                NUMERIC NOT NULL,
    y                NUMERIC NOT NULL,
    width            NUMERIC NOT NULL,
    height           NUMERIC NOT NULL,
    label            TEXT    NOT NULL DEFAULT '',
    parent_id        TEXT,
    boundary_host_id TEXT,
    task_type        TEXT    REFERENCES ref_bpmn_task_type(code),
    gateway_type     TEXT    REFERENCES ref_gateway_type(code),
    event_type       TEXT    REFERENCES ref_event_type(code),
    repeat_type      TEXT    REFERENCES ref_repeat_type(code),
    flow_type        TEXT    REFERENCES ref_flow_type(code)
);
CREATE INDEX idx_tmpl_el_template ON template_element(template_id);

CREATE TABLE template_element_property (
    id              BIGSERIAL PRIMARY KEY,
    element_id      TEXT      NOT NULL REFERENCES template_element(id) ON DELETE CASCADE,
    property_name   TEXT      NOT NULL,
    property_value  TEXT
);
CREATE INDEX idx_tmpl_prop_element ON template_element_property(element_id);

CREATE TABLE template_connector (
    id                      TEXT    PRIMARY KEY,
    template_id             TEXT    NOT NULL REFERENCES diagram_template(id) ON DELETE CASCADE,
    source_id               TEXT    NOT NULL REFERENCES template_element(id) ON DELETE CASCADE,
    target_id               TEXT    NOT NULL REFERENCES template_element(id) ON DELETE CASCADE,
    type                    TEXT    NOT NULL REFERENCES ref_connector_type(code),
    direction_type          TEXT    NOT NULL REFERENCES ref_direction_type(code),
    routing_type            TEXT    NOT NULL REFERENCES ref_routing_type(code),
    source_side             TEXT    NOT NULL REFERENCES ref_side(code),
    target_side             TEXT    NOT NULL REFERENCES ref_side(code),
    source_invisible_leader BOOLEAN NOT NULL DEFAULT FALSE,
    target_invisible_leader BOOLEAN NOT NULL DEFAULT FALSE,
    source_offset_along     NUMERIC,
    target_offset_along     NUMERIC,
    label                   TEXT,
    label_offset_x          NUMERIC,
    label_offset_y          NUMERIC,
    label_width             NUMERIC,
    label_anchor            TEXT    REFERENCES ref_label_anchor(code)
);
CREATE INDEX idx_tmpl_conn_template ON template_connector(template_id);

CREATE TABLE template_connector_waypoint (
    id           BIGSERIAL PRIMARY KEY,
    connector_id TEXT      NOT NULL REFERENCES template_connector(id) ON DELETE CASCADE,
    ordinal      INT       NOT NULL,
    x            NUMERIC   NOT NULL,
    y            NUMERIC   NOT NULL
);
CREATE INDEX idx_tmpl_wp_connector ON template_connector_waypoint(connector_id);


-- ============================================================================
-- SCHEMA VERSION
-- ============================================================================
-- This DDL corresponds to Diagramatix schema version 1.5
-- See also: diagramatix-export.xsd for the XML export schema
-- ============================================================================
