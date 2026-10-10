import { Stack } from "expo-router";
import '@/global.css'
import { useEffect } from "react";
import { nhTaxonomy } from "@/services/nh/nhShared";

export default function RootLayout() {
  // Keep the shared tag taxonomy warm for the whole (nh) section.
  useEffect(() => {
    void nhTaxonomy.bootstrap().catch(() => {});
  }, []);

  return (
    <>
      <Stack screenOptions={{headerShown:false , contentStyle: { backgroundColor: "#000" }}} />
    </>
  );
}
