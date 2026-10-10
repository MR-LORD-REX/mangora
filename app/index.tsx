import { Redirect } from "expo-router";

/** App now boots straight into the Library tab. */
export default function Index() {
  return <Redirect href="/(tabs)/library" />;
}
