# Laiven

**Laiven** ("language" in Suvelinian, one of my conlangs) is a free API-first platform for building constructed languages, built after I got pissed a little too much by the dreaded .md file.

---

## Overview

- **No hardcoded schema** - every word is composed of user-defined attributes. If your language doesn't have spelling you won't be bogged my the spelling field screaming that it can't be empty.
- **Visual, zero-code approach** - all the complex stuff like rules and builder logic are handled by intuitive drag-and-drop node blocks.
- **Rules, rules and more rules** - the user can define rules that must be satisfied for each word attribute (e.g. "Word must have a vowel") using flexible variables. Changes are validated live when creating or editing words.
- **Builders and derivatives** - setup workflows to automatically produce variations of the words based on logic defined in node graphs. Have an exception? No problem, manually override it, cascading changes won't affect it.
- **Versioning** - Laiven keeps full version history for all words.
- **Multi-user support** - supports multiple users with granular access control.

## Deployment

### Via Docker

The only supported way to run Laiven is by building it into a Docker container. To do that, build the `server/` and `client/` images from their respective `Dockerfile`s:

```bash
docker build -t laiven-server ./server
docker build -t laiven-client ./client
```

Or use pre-built images from my GitLab instance and [docker-compose.deploy.yml](docker-compose.deploy.yml) as an example — copy it, fill in a `.env` based on [.env.example](.env.example), then run `docker compose -f docker-compose.deploy.yml up -d`.

## Tech Stack

### Backend (`server/`)

- **Fastify 5** with TypeScript, auto-generated OpenAPI/Swagger docs at `/api/docs`.
- **Drizzle ORM** on PostgreSQL 16 with `drizzle-kit push` for schema management.
- **ioredis** with a custom session store adapter backing `@fastify/session`.
- **bcryptjs** for password and API key hashing.
- **@fastify/rate-limit** for per-IP throttling.
- **Vitest** for unit and integration tests.

### Frontend (`client/`)

- **Vite + React 18** with TypeScript and path aliases.
- **Mantine v7** for the component system (forms, modals, tables, notifications, theming).
- **@xyflow/react** (React Flow v12) for the node graph editor.
- **@dnd-kit** for drag-and-drop reordering of attributes, variable items, word rules, and derivative rules.
- **@tanstack/react-query** for API state management.
- **Vitest + @testing-library/react** for component tests.

### Infrastructure

- `docker-compose.yml` — PostgreSQL + Redis for local development.
- `docker-compose.deploy.yml` — deployment example for production.
- `.gitlab-ci.yml` — CI pipeline with test + build stages.

---

## Usage

### Project

Each constructed language is a project. All schemas, rules, builders, variables and words are project-scope. Users can belong to multiple projects with different permissions.

### Attribute

Attributes are the per-project schema for words. There are no built-in fields — even "the word itself" is a user-defined attribute. Supported types:

| Type | Description |
|---|---|
| **String** | Free-text value |
| **One-of** | Single selection from inline-configured options (e.g. Noun/Verb/Adjective) |
| **Integer** | Whole number |
| **Boolean** | True / false |
| **Single Relation** | A link to one other word in the project |
| **Multiple Relation** | Links to multiple other words |

Attributes can be marked **required**, **unique** (off / case-sensitive / case-insensitive), and carry an optional description rendered as inline help. Display order is configurable via drag-and-drop.

### Variable

A named, reusable data container defined at the project level.

- **Kind**: `Constant` (single value) or `Array` (ordered list of values).
- **Data Type**: `String`, `One-of`, `Integer`, or `Boolean`.

Example variables: Vowels (array of strings), Consonants (array of strings), Verb Suffixes (array of strings).

Rule and builder graphs reference variables by name via the **Variable Reference** node. The node returns a single value for constants and an array for arrays.

### Rule (reusable library)

A rule is a node graph that returns pass/fail for a given word. Rules live in a **project-wide library** and are linked to consumers via explicit link tables:

- **Word rules** (`word_rule_links`) — run during word validation (every word in the project). Each link has its own `required` flag and `displayOrder`: required failures block saving; optional failures show as warnings in the live validation panel.
- **Derivative applicability rules** (`derivative_type_rule_links`) — attached to a specific derivative type, they determine whether that derivative applies to a given word. For example, "Past Tense" might only apply when `word_type = Verb`.

The same rule can be linked to multiple consumers. Editing the rule's graph affects every place it's linked; the editor shows where it is used in the top right.

### Builder

A builder is a node graph that produces a string — the generated form of a word (derivative). Builders can reference other derivatives via dependency declarations, so you can build a past participle from an already-computed past tense.

### Derivative

A derivative is a derived form of a word: past tense, plural, diminutive, participle, etc. Derivative types are defined at the project level with:

- **Applicability rules** (linked from the rules library, ordered) - define the rules which words will receive said derivative.
- **Builder** (the node graph that produces the value) - the flow that will build the derivative by, for example, adding a suffix.
- **Dependencies** (other derivative types that must compute first — with circular dependency detection)
- **Required/optional** flag - whether or not the derivative must be present for each word.

When a word is created or edited, all applicable builders run automatically. If you manually edit a derivative value, it's marked as **user-modified** (shown with an * indicator) and never overwritten by the builder again — but the builder's would-be output is shown as a suggested value.

When a builder graph or derivative type configuration is updated, **cascade regeneration** automatically re-runs all affected builders across the project. This creates `cascade` version entries for each updated word, and user-modified derivatives are preserved.

### Versioning

Every word including attribute values and derivatives attributes is versioned. Each write creates a new version record with a full JSON snapshot, the author's display name, and a change type (`created` / `updated` / `deleted` / `cascade`). The `cascade` type is used for auto-updates triggered by builder or derivative type changes.

---

## Node Graph Engine

Rules and builders share the same engine and the same visual editor. All node definitions live in the backend (`server/src/modules/node-engine/nodes/`) and are served to the frontend via `GET /api/v1/node-types` — adding a new node type is a single backend file change that flows through to the palette automatically.

### Node categories (34 total)

- **Input (4)** — Attribute Input, Derivative Input, Literal Value (String/Integer/Boolean), Variable Reference
- **Condition (10)** — Contains One Of, Starts/Ends With One Of, Equals, Not Equals, Is Empty, Length Compare, Matches Pattern (regex), Is One Of, Attribute Equals
- **Transform (13)** — Append, Prepend, Remove Last/First N, Replace, Replace Pattern (regex), Substring, To Uppercase/Lowercase, Concatenate, Get Last/First N, Lookup in Map
- **Flow Control (4)** — If / Branch, Return (Rule), Return (Builder), Merge
- **Logic (3)** — AND, OR, NOT

### Editor features

- Searchable, categorised palette with 2-line descriptions per node and hover tooltips
- Draggable, zoomable, pannable canvas (React Flow)
- Inspector panel with typed configuration fields per node (literal-type selectors, JSON map editor, attribute picker, variable picker, regex input, etc.)
- Dedicated test mode: enter sample attribute values, run the graph, see each node light up green/red with its intermediate inputs and output rendered inline on the node
- Executor derives the set of attributes actually read during execution and returns them in the trace, so the frontend can surface per-field inline errors

---

## Web UI Tour

### Dashboard
Grid of projects the user has access to, each with name, description, and quick stats.

### Word Search (project home)
- Debounced free-text search
- "Advanced search" toggle opens a nested AND/OR/NOT query builder with type-appropriate operators per attribute
- Results table with configurable columns, sortable headers, expandable rows for derivative values, bulk select and delete

### Word Editor

Two-column layout:
- **Left**: attribute fields rendered by type, sticky save bar at the bottom
- **Right**: sticky live validation panel (rule-by-rule pass/warn/fail with touched-attribute chips) + derivatives panel with suggested values and reset-to-auto controls
- Version history and diff viewer at the bottom of the page.
- Cmd/Ctrl+S saves from anywhere

### Sidebar Navigation

- **Words** (project home / search)
- **Rules** — collapsible parent with three sub-pages:
  - **Word Rules** — ordered list of rules that validate every word, drag-and-drop reorder, per-link required toggle
  - **Derivative Rules** — accordion grouped by derivative type, per-link drag-and-drop reorder
  - **Rules Library** — full searchable list with bulk enable/disable, usage badges showing every consumer
- **Variables** — inline item editor per variable, kind and data type selectors
- **Attributes** — drag-and-drop reorder, unique mode toggle, inline type selection, one-of options editor
- **Builders** — list and edit
- **Derivative Types** — per-type configuration with dependencies, applicability rules via a shared rule picker, and the linked builder
- **Project Settings** — name, description, member management with role assignment, danger zone

### Node Graph Editor
Full-screen editor for any rule or builder. Palette on the left, canvas in the centre, inspector on the right, test panel overlay. When editing a rule linked to multiple consumers, a compact "used by N places" badge + popover in the header warns that changes affect everywhere the rule is linked.

### Profile Page
Users can change their display name and password.

### User Management (instance admin)
List, create, edit, deactivate users.

---

## REST API

Every UI capability is available through the API at `/api/v1/...`. Interactive OpenAPI documentation (Swagger UI) is at `/api/docs/`.

---

## Getting Started

### Prerequisites

- Docker (for PostgreSQL and Redis)
- Node.js 20+ and npm

### Local development

```bash
sudo docker compose up -d

cd server
npm install
npx drizzle-kit push --force
npm run db:seed

npm run dev        # → http://localhost:3001 (+ /api/docs)

cd ../client
npm install
npm run dev        # → http://localhost:5173
```

The seed script populates a sample project called **"Eldarian"** with 5 attributes, 3 variables (Vowels, Consonants, Verb Suffixes), one word rule (`Word must contain a vowel`), one builder (`Past Tense Builder`), one derivative type (`Past Tense`) with its applicability rule, and 5 sample words. Initial version records are created for all seeded entities.

Default credentials created by the seed:

- **Email**: `admin@laiven.local`
- **Password**: `admin123!`

## Note

Laiven is mainly built to work with how I work, while I do accept feature request nothing is a given.

If you are interested in contributing, please contact me in advance or feel free to fork the project.

## License

GNU AGPL (General Affero Public License).