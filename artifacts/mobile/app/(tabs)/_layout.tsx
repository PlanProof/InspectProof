import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Colors } from "@/constants/colors";
import { SyncStatusBadge } from "@/components/OfflineBanner";

/**
 * expo-glass-effect calls requireNativeModule('ExpoGlassEffect') on iOS,
 * which throws in Expo Go where that native module is not bundled.
 * We catch any error and safely return false so ClassicTabLayout is used.
 */
function safeIsLiquidGlassAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isLiquidGlassAvailable } = require("expo-glass-effect");
    return !!isLiquidGlassAvailable?.();
  } catch {
    return false;
  }
}

/**
 * expo-router/unstable-native-tabs uses react-native-bottom-tabs which
 * registers a native view at import time. On Android Expo Go that native
 * view is not bundled and throws, crashing the app before any screen loads.
 * Lazy-load with require() inside a try-catch — falls back to null so
 * NativeTabLayout is never rendered on unsupported environments.
 */
function safeGetNativeTabs(): {
  NativeTabs: any;
  Icon: any;
  Label: any;
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-router/unstable-native-tabs");
  } catch {
    return null;
  }
}

function NativeTabLayout() {
  const nativeTabs = safeGetNativeTabs();
  if (!nativeTabs) return null;

  const { NativeTabs, Icon, Label } = nativeTabs;

  // Only the four visible tab triggers are registered here.
  // All nested/sub-screens (inspection detail, project detail, settings, etc.)
  // are navigated to via router.push() and do not need a trigger — adding them
  // as triggers (even with display:none) causes them to appear as extra buttons
  // in the native tab bar on iOS.
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="inspections">
        <Icon sf={{ default: "clipboard", selected: "clipboard.fill" }} />
        <Label>Inspections</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="projects">
        <Icon sf={{ default: "folder", selected: "folder.fill" }} />
        <Label>Projects</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="more">
        <Icon sf={{ default: "ellipsis.circle", selected: "ellipsis.circle.fill" }} />
        <Label>More</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.tabBarActive,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : Colors.tabBar,
          borderTopWidth: 0,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint="dark"
              style={[StyleSheet.absoluteFill, { backgroundColor: Colors.tabBar + "E0" }]}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.tabBar }]} />
          ),
        tabBarLabelStyle: {
          fontFamily: "PlusJakartaSans_600SemiBold",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={22} />
            ) : (
              <Feather name="home" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="inspections"
        options={{
          title: "Inspections",
          tabBarIcon: ({ color }) => (
            <View>
              {isIOS ? (
                <SymbolView name="clipboard" tintColor={color} size={22} />
              ) : (
                <Feather name="clipboard" size={20} color={color} />
              )}
              <SyncStatusBadge />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="folder" tintColor={color} size={22} />
            ) : (
              <Feather name="folder" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="issues"
        options={{ href: null }}
      />
      {/* Nested screens — kept in tabs group so the tab bar stays visible */}
      <Tabs.Screen name="project/[id]"                  options={{ href: null }} />
      <Tabs.Screen name="inspection/[id]"               options={{ href: null }} />
      <Tabs.Screen name="inspection/create"             options={{ href: null }} />
      <Tabs.Screen name="inspection/conduct/[id]"             options={{ href: null }} />
      <Tabs.Screen name="inspection/conduct/induction/[id]"  options={{ href: null }} />
      <Tabs.Screen name="inspection/generate-report"         options={{ href: null }} />
      <Tabs.Screen name="inspection/photo-markup"       options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="inspection/document-viewer"    options={{ href: null }} />
      <Tabs.Screen name="feedback"                      options={{ href: null }} />
      <Tabs.Screen name="profile"                       options={{ href: null }} />
      <Tabs.Screen name="settings"                      options={{ href: null }} />
      <Tabs.Screen name="team"                          options={{ href: null }} />
      <Tabs.Screen name="help"                          options={{ href: null }} />
      <Tabs.Screen name="change-password"               options={{ href: null }} />
      <Tabs.Screen name="analytics"                     options={{ href: null }} />
      <Tabs.Screen name="notifications"                 options={{ href: null }} />
      <Tabs.Screen name="documents"                     options={{ href: null }} />
      <Tabs.Screen name="templates/index"               options={{ href: null }} />
      <Tabs.Screen name="templates/[id]"                options={{ href: null }} />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="ellipsis.circle" tintColor={color} size={22} />
            ) : (
              <Feather name="more-horizontal" size={20} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (safeIsLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
