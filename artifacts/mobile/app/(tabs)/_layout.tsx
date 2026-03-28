import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { Colors } from "@/constants/colors";

function NativeTabLayout() {
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
      {/* Hidden nested screens — no trigger, keeps tab bar visible */}
      <NativeTabs.Trigger name="project/[id]" style={{ display: "none" }} />
      <NativeTabs.Trigger name="inspection/[id]" style={{ display: "none" }} />
      <NativeTabs.Trigger name="inspection/create" style={{ display: "none" }} />
      <NativeTabs.Trigger name="inspection/conduct/[id]" style={{ display: "none" }} />
      <NativeTabs.Trigger name="inspection/generate-report" style={{ display: "none" }} />
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
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.tabBar }]} />
          ) : null,
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
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="clipboard" tintColor={color} size={22} />
            ) : (
              <Feather name="clipboard" size={20} color={color} />
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
      <Tabs.Screen name="inspection/conduct/[id]"       options={{ href: null }} />
      <Tabs.Screen name="inspection/generate-report"    options={{ href: null }} />
      <Tabs.Screen name="inspection/photo-markup"       options={{ href: null }} />
      <Tabs.Screen name="inspection/document-viewer"    options={{ href: null }} />
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
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
