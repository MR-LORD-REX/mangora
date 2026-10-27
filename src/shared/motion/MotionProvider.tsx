import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo } from "react-native";

interface AppMotionContextValue {
  reduceMotion: boolean;
}

const AppMotionContext = createContext<AppMotionContextValue>({
  reduceMotion: false,
});

export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    <AppMotionContext.Provider value={{ reduceMotion }}>
      {children}
    </AppMotionContext.Provider>
  );
}

export function useAppMotion(): AppMotionContextValue {
  return useContext(AppMotionContext);
}