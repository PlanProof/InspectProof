import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_BAR_CONTENT_HEIGHT = Platform.select({
  ios: 49,
  android: 56,
  default: 56,
});

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === "web") return 84;
  return TAB_BAR_CONTENT_HEIGHT + insets.bottom;
}
