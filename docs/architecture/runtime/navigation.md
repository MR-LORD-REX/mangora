# Navigation

Navigation is Expo Router file routing plus thin adapter components. Feature
screens receive callbacks such as `onOpenManga` and `onReplaceReader`; they do
not import route files or `@composition/*`.

## Route shape

```text
app/
  index.tsx                         redirect to Library
  (tabs)/
    _layout.tsx                     four tabs
    library.tsx                     Library screen
    history.tsx                     history route composer
    browse.tsx                      extension browsing
    settings.tsx                    settings landing
  extensions/source/[sourceId].tsx  source catalogue
  manga/[slug].tsx                  shared manga detail
  reader/[id].tsx                   shared chapter reader
  downloads/index.tsx               download manager
  downloads/[mangaId].tsx           downloaded title
  settings/                         per-section settings stack
```

`app/downloads` and `app/settings` are separate stacks so their screens can
provide their own headers and back behavior. The root stack has `headerShown:
false`; feature screens render their own chrome.

## Identity contract

Never reconstruct an extension manga or chapter id from a title. The extension
returns opaque values (`SManga.url`, `SChapter.url`) and the app must pass them
back unchanged, with the same encoding.

The shared manga route accepts:

- `slug` - the provider's exact manga identity;
- `provider` - normally `ext:<sourceId>`;
- optional `thumbnailUrl`;
- optional `downloadsOnly=1` for an offline-only view.

The shared reader route accepts:

- `id` - the provider chapter identity;
- `source` - normally `ext:<sourceId>`;
- `mangaId` - provider manga identity when available;
- display snapshots (`title`, `mangaTitle`, `chapterTitle`, `thumbnailUrl`)
  and optional `language`/`chapterMemo`.

`src/core/catalog/readerIdentity.ts` decodes route values into provider ids and
canonical DB ids. `src/core/catalog/identity.ts` owns `canonicalId()`. Use those
helpers rather than duplicating string assembly.

## Navigation callbacks

`src/composition/navigation/manga.ts` exposes `openMangaInfo()`. A route passes
it into a feature screen, so the feature can open the detail page without
importing Expo Router or composition. Downloads likewise construct an offline
reader target and hand the resulting params to the route callback.

When adding a route:

1. Keep the route file to parameter parsing and composition.
2. Pass navigation through a typed prop.
3. Put loading, empty and error states in the feature screen.
4. Add the route to the generated route list in this document and the
   [system map](../system-map.md).
5. Verify both online and offline entry points if the route can open a chapter.

## Tab and modal behavior

- The tab navigator uses a short fade transition; `MotionProvider` disables it
  when the user prefers reduced motion.
- Settings sub-pages use a headerless stack with a fade unless reduced motion is
  enabled.
- Reader, manga and source detail routes sit outside the tab shell.
- Root feature hosts (`DownloadSheetHost`) are mounted above the stack. Overlays
  registered through `OverlayHostProvider` must be cleaned up on unmount.

## Deep links and sharing

The native Android manifest is extended by `plugins/withAppLinks.js`. The app
uses the `mangora` scheme and accepts HTTPS links configured in `app.json` for
the Mangora website's manga paths. Provider identity still comes from the link
params; sharing must respect the `ageRestrictedSources` setting.

Do not add a provider-specific deep-link parser. Extend the shared manga route
and the opaque-id handling, and keep the user-facing safety rules in settings.

## Related reading

- [System map](../system-map.md)
- [Manga and library](../features/library-and-manga.md)
- [Reader](../features/reader.md)
- [Native plugins](../native/config-plugins.md)