/**
 * Screen lifetime effects for the reader route.
 *
 * Orientation must be released when leaving the reader; keep-awake follows
 * reader focus so a backgrounded reader cannot pin the display on.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useFocusEffect } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { useCallback, useEffect } from "react";

export interface ReaderScreenLifetimeOptions {
  orientationLock: ScreenOrientation.OrientationLock;
  keepScreenOn: boolean;
}

export function useReaderScreenLifetime({
  orientationLock,
  keepScreenOn,
}: ReaderScreenLifetimeOptions) {
  useEffect(() => {
    ScreenOrientation.lockAsync(orientationLock).catch((error) => {
      console.warn("Failed to lock screen orientation:", error);
    });
    return () => {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.DEFAULT,
      ).catch(() => {});
    };
  }, [orientationLock]);

  useFocusEffect(
    useCallback(() => {
      if (keepScreenOn) {
        activateKeepAwakeAsync("trapp-reader").catch(() => {});
      }
      return () => {
        deactivateKeepAwake("trapp-reader").catch(() => {});
      };
    }, [keepScreenOn]),
  );
}
