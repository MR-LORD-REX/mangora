# ADR 0004: LTR app layout with explicit reading direction

- Status: Accepted
- Date: 2026-10-28

## Context

Android mirrors the React Native surface when the device locale is RTL and the
application declares `android:supportsRtl="true"`. Mangora's reader image and
translation overlays use natural page coordinates; a device-wide mirror moves
chrome and absolute overlays relative to the source image. The reader already
has its own `readerPagedDirection` setting, so device-locale mirroring is both
unnecessary and incorrect for page geometry.

## Decision

Keep the application layout LTR on every device:

- set `android:supportsRtl="false"` through `plugins/withLtrLayout.js` and the
  generated Android manifest;
- call `enforceLtrLayout()` once from the root layout so the JS policy is
  explicit and survives native rebuilds;
- treat `readerPagedDirection` as the only reading-direction control.

Text shaping for Arabic and other RTL scripts remains native and is not affected
by this layout decision.

## Consequences

- Translation overlays, tap-zone previews and absolute reader chrome keep the
  same coordinate origin on LTR and RTL-locale phones.
- Manual RTL manga paging remains available from the reader settings.
- New UI must not assume that a page-turn direction is derived from the device
  locale.

## Validation

Set an Arabic locale on a test device or emulator, install a build that contains
the manifest plugin, and verify overlays stay on their source bubbles in paged
and strip modes. Also test manual RTL page order. Record the result in the
[reader device checklist](../operations/validation-and-qa.md).
