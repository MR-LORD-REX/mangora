/**
 * Provider identity shared by persisted catalog rows and reader routes.
 *
 * Extension sources use `ext:<sourceId>`. The open string branch keeps legacy
 * rows readable without reconstructing or guessing their opaque ids.
 */
export type ProviderId = `ext:${string}` | (string & {});