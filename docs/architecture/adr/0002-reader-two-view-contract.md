# ADR 0002: Two reader views and one strip camera

- Status: Accepted
- Date: 2026-10-26

## Context

The reader accumulated independent paging, zoom and scroll owners. Long-strip
pages need one continuous coordinate space, while paged mode needs independent
page slots and pinch gestures. Sharing a per-page transform in strip mode made
overlays drift and allowed two vertical pan owners.

## Decision

Keep exactly two presentation views:

- `paged`: `FlatList`, one viewport-sized page slot, independent page zoom.
- `strip`: a custom virtualized `ScrollView` over stable world offsets, with
  one strip-wide camera and a bounded mounted-page window.

In strip mode page rows are inert. The viewport owns tap-zone and long-press
resolution, and page identity comes from screen-to-world conversion. While
zoomed, the camera is the only vertical pan owner. Page-turn taps move by a
viewport fraction rather than skipping a whole page. Image and translation
overlay share the same page transform.

## Consequences

- Strip chunks are mounting windows only; they never own scale, pan or page
  order.
- Paged and strip share display items, geometry, page identity and tap-zone
  policy.
- Native reader surfaces must stay compatible with the one-camera overlay
  design; do not add a per-page gesture owner in strip mode.

## Validation

Static tests cover camera math, windowing, geometry and tap zones. The
[reader device smoke test](../operations/validation-and-qa.md) is the release
gate for touch, alignment and restore behavior.
