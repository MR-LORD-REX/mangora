import { router, useLocalSearchParams, type Href } from "expo-router";

import BrowseExtensionsScreen from "@features/extensions/screens/BrowseExtensionsScreen";

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function BrowseRoute() {
  const params = useLocalSearchParams<{
    tab?: string | string[];
    query?: string | string[];
  }>();
  const requestedTab = paramString(params.tab);
  const initialTab =
    requestedTab === "extensions" || requestedTab === "migrate"
      ? requestedTab
      : "sources";

  return (
    <BrowseExtensionsScreen
      initialTab={initialTab}
      initialQuery={paramString(params.query)}
      onOpenSource={(sourceId) =>
        router.push(
          `/extensions/source/${encodeURIComponent(sourceId)}` as Href,
        )
      }
    />
  );
}