import {
  PlusJakartaSans_600SemiBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Feather } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { Colors } from "@/constants/colors";

// Set base URL at module level for Expo
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="project/[id]"
        options={{
          title: "Project",
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
        }}
      />
      <Stack.Screen
        name="inspection/[id]"
        options={{
          title: "Inspection",
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
        }}
      />
      <Stack.Screen
        name="issue/[id]"
        options={{
          title: "Issue",
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
        }}
      />
      <Stack.Screen
        name="analytics"
        options={{
          title: "Analytics",
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
        }}
      />
      <Stack.Screen
        name="inspection/create"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="inspection/conduct/[id]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="inspection/generate-report"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="inspection/photo-markup"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_600SemiBold,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
