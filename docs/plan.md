# Documentation, website and architecture graph plan

This plan covers the documentation phase for the Mangora Android app and the
follow-on website work. It replaces ad-hoc notes with a measurable delivery path;
the architecture pages describe the current system, while this file tracks the
work to publish and maintain them.

## Scope and constraints

In scope:

- contributor-friendly architecture documentation under `docs/architecture/`;
- user-facing guide source under `docs/appguide/` for `/android/docs`;
- developer documentation publication at `/android/dev/docs`;
- an interactive dependency explorer at `/android/dev/graph`;
- deterministic generation and a release-time freshness gate.

Out of scope for this phase:

- changing reader, download or translation behavior as part of documentation;
- making the generated graph the only source of architectural truth;
- coupling the Expo app to the website's React component tree;
- hand-maintained copies of generated dependency data.

The app repository remains the source of truth for architecture. The website is a
separate repository under `C:\VS-code\TR_APP\mangora-website` and consumes
versioned Markdown and JSON artifacts from this app.

## Delivery phases

### Phase 1 - Architecture documentation baseline

**Goal:** a contributor can understand the app and find the owner of any behavior
without reading the whole source tree.

Deliverables:

- [x] Overview, system map and boundary pages.
- [x] Runtime pages for startup, providers, navigation, persistence and native/network.
- [x] Feature pages for reader, library/manga, extensions, downloads, translation/vision,
  settings/updates and shared contracts.
- [x] Native config-plugin and native-module pages.
- [x] Build, validation and documentation-operation pages.
- [x] Architecture decision records and a documentation landing page.
- [x] Generated dependency graph and public API snapshot.
- [x] A deterministic `docs:graph` / `docs:check` workflow.
- [x] Graph schema v2 with file exports and symbol-level import/re-export
  bindings.
- [x] Parser regression tests for static, dynamic and type-only declarations.

Acceptance criteria:

- A new contributor can trace the startup provider tree, one feature request and
  one native call using links only.
- Every architecture page distinguishes current behavior from future work.
- No page references the retired root planning document or a deleted QA file.
- `npm run docs:check` passes with no boundary findings or import cycles.

Validation:

```powershell
npm run docs:graph
npm run docs:check
npm run docs:test
npm run check
```

### Phase 2 - Documentation hygiene and source alignment

**Goal:** remove superseded material and make every remaining document resolve,
link correctly and assert behavior that the source still implements.

Work:

1. Retire content that has moved into the architecture tree. Keep release notes,
   third-party notices, the public README and feature-owned READMEs.
2. Audit relative Markdown links on Windows; path depth mistakes must fail a
   docs check rather than depend on renderer tolerance.
3. Check feature exports, routes, tables and native modules against source. Update
   the system map and feature pages when an export or route changes.
4. Keep the generated snapshot in the same change as an import/public-export
   change.
5. Add a docs link check to the contributor workflow (implemented by
   `npm run docs:links`).
6. Retire local-only implementation notes whose durable content is now covered
   by this tree; keep the agent guide pointing at the maintained pages.

Acceptance criteria:

- Every relative link in `docs/`, the public README and feature READMEs resolves.
- `docs/architecture/README.md` is a navigation page, not a duplicate of the
  old plan.
- No page relies on a deleted QA file or a generated `android/` path as its
  source of truth.
- Generated JSON contains no commit hash or dirty-worktree flag that changes on
  every revision.

### Phase 3 - Website developer documentation

**Goal:** publish `/android/dev/docs` from the same Markdown that contributors
review in this repository.

Implementation shape:

- the website has a docs content adapter that reads `docs/architecture/`;
- headings, tables, callouts and repository-relative links are mapped to the site;
- route slugs mirror directories (`features/reader` -> `/android/dev/docs/features/reader`);
- the docs build refuses broken internal links and unknown generated-schema
  versions;
- the site displays the app version from the generated graph snapshot, not
  `package.json`.

Acceptance criteria:

- Every architecture page has a stable URL and crawlable title/description.
- Relative source links open the corresponding repository path (or a configured
  code host URL).
- Search covers page titles, headings and prose without indexing generated JSON.
- The docs remain usable with JavaScript disabled; the graph is a separate route.
- A broken link or stale generated snapshot fails the website build.

### Phase 4 - User guides at `/android/docs`

**Goal:** provide tested, task-oriented instructions without mixing in internals.

Work:

1. Build pages from [`appguide/README.md`](appguide/README.md): getting
   started, sources, library, reader, downloads, translation, settings/updates
   and troubleshooting.
2. Capture release-build screenshots/clips for each procedure and store them
   with descriptive names and alternative text.
3. Validate each procedure on a release build against the matching
   [device QA checklist](architecture/operations/validation-and-qa.md).
4. Add a version selector or a visible "applies to app version" label.
5. Keep privacy and source-specific limitations near the action they affect.

Acceptance criteria:

- A user can install, add a source, read, download and translate without a
  developer-specific step.
- Every screenshot matches the current release UI and has alt text.
- Troubleshooting covers missing sources, permissions, storage and translation
  limits.
- User docs never link readers to internal ADRs unless a "For developers" link is
  intentional.

### Phase 5 - Interactive dependency graph at `/android/dev/graph`

**Goal:** make the generated graph explorable without turning the browser into a
second architecture inventory.

Recommended stack:

| Concern | Recommendation | Reason |
| --- | --- | --- |
| Graph canvas | `@xyflow/react` | Custom React node cards, edges, minimap and accessible focus states. |
| Layout | `elkjs` | Deterministic layered layout across zones/features; can run in a worker. |
| Search/filter | local index over node ids and API exports | No backend required; works with a static site. |
| Large-graph fallback | Cytoscape.js + fcose or Sigma.js + Graphology | Better scale if the file view grows beyond React Flow's comfortable range. |

Interaction contract:

- open in aggregate mode: zones first, then feature slices;
- drill down to files without loading every file node at startup;
- filter by zone, feature, file kind and boundary finding;
- search by repository path, exported symbol, imported symbol or import specifier;
- show a file node's export count and full export list;
- render one edge per import/re-export declaration, labelled from its bindings
  (`Foo, Bar as Baz` or `Foo, Bar +1` when truncated);
- select an edge to show its full binding list, declaration kind and module
  specifier;
- filter type-only, dynamic and side-effect declarations independently;
- select a node to show importers, imports and API entries;
- highlight cycles and violations with a legend that explains the rule;
- support keyboard navigation, reduced motion and an accessible text/table view;
- debounce layout and render it in a worker for large subsets.

Data contract:

- consume `docs/architecture/generated/dependency-graph.json` and
  `api-surface.json` unchanged;
- support graph schema v2 with node `exports`, edge `bindings`, `typeOnly` and
  deterministic edge `id` fields;
- fail visibly on an unsupported `schemaVersion`;
- never patch generated edges in the website;
- never synthesize one edge per binding; one declaration remains one edge;
- do not add library or CSS imports to this graph; they are outside the
  app-owned dependency boundary;
- keep aggregate counts and file drill-down derived from the same snapshot.

Acceptance criteria:

- The graph is useful at the current 367-file scale without a full graph render
  on first paint.
- A contributor can answer "who imports this module?", "who imports this
  symbol?" and "what does this file or feature export?" in the UI.
- Mobile layout remains usable or explicitly links to the desktop experience.
- The text fallback lists nodes/edges for screen readers and non-visual clients.

### Phase 6 - Release automation

**Goal:** make documentation and graph freshness part of the release contract.

Chosen default: checked-in generated snapshots. The website consumes the snapshot
from the tagged or default branch. This is reviewable and keeps the website build
independent of a sibling checkout.

Required jobs:

1. PR validation runs `npm run docs:check` together with `npm run check`.
2. Release validation fails if generated snapshots do not match checked-in files
   or if the app version and graph `appVersion` disagree.
3. Release uploads the docs snapshot as an artifact for auditability, even when
   the checked-in copy is the publication source.
4. The website build pins to a release tag or a documented default-branch
   snapshot; it records the app version and generation schema version.

Optional alternative: upload generated JSON as a release artifact and have the
website deployment download it. If adopted, keep `docs:check` on the app side and
document the artifact name/version in the website repo.

Acceptance criteria:

- A source change that affects imports/public exports cannot merge with a stale
  snapshot.
- A release tag cannot publish with missing or mismatched generated docs.
- The website can reproduce the exact docs/graph pair it served.
- The snapshot never includes a commit hash or dirty-worktree flag that changes
  without a source change.

### Phase 7 - Ongoing per-release maintenance

**Goal:** keep docs accurate as the app evolves rather than rebuilding them at
each release.

Per-release checklist:

- [ ] Regenerate the dependency graph and API surface.
- [ ] Update affected architecture pages and feature READMEs.
- [ ] Add an ADR when a boundary, shared runtime contract or reader view model
  changes.
- [ ] Update user guides for visible behavior changes and replace stale media.
- [ ] Run the release validation checklist on a build from the tagged source.
- [ ] Confirm the website's docs/graph version matches the published app version.

Ownership:

- feature authors update their feature page and README;
- the architecture maintainer reviews cross-feature and ADR changes;
- the release maintainer owns the version/tag/snapshot gate;
- the website maintainer owns route rendering and graph performance.

Acceptance criteria:

- The release notes, app version, generated `appVersion` and website label agree.
- No documentation change requires editing generated JSON by hand.
- A contributor can add a feature page and public export without learning the
  website internals.

## Dependencies and risks

| Risk | Mitigation |
| --- | --- |
| Generated graph grows too large for a browser | Aggregate-first view, filtering and a graph renderer with a mature large-graph fallback. |
| Docs drift from source | `docs:check`, explicit ownership and same-change updates. |
| Cross-platform path bugs hide violations | Run architecture/docs checks on Windows and Linux CI; use normalized forward-slash ids. |
| Website and app docs diverge | One Markdown source under `docs/`, rendered by the website; no copy-paste fork. |
| User docs describe an internal build | Require release-build screenshots and the device QA checklist. |
| Graph captures sensitive data | Scan only TypeScript paths/import specifiers; never include secrets, URLs or runtime values. |

## Definition of done for the documentation phase

- Architecture set is complete, linked, source-accurate and free of superseded
  pages.
- User guide source structure is established and ready for tested content.
- Generated graph/API artifacts are deterministic and checked in.
- `npm run docs:check` and `npm run check` pass.
- The release workflow rejects stale docs.
- The website implementation starts only after these app-side contracts are
  stable.
