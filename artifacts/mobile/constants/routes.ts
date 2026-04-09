import { router } from "expo-router";

/**
 * Validated tab-level fallback routes. All entries must correspond to an
 * existing file at artifacts/mobile/app/(tabs)/<name>.tsx or index.tsx.
 */
export type AppRoute =
  | "/(tabs)/more"
  | "/(tabs)/settings"
  | "/(tabs)/inspections"
  | "/(tabs)/templates";

/**
 * Typed safe-back helper: navigates back if there is a previous screen in the
 * history stack, otherwise replaces with a known fallback route.
 *
 * Use this instead of bare `router.back()` to avoid dead-end navigation when
 * a screen is opened via a deep link or cold launch.
 *
 * The fallback must be one of the validated AppRoute values — all of which
 * correspond to top-level tab screens verified to exist in this project.
 */
export function safeBack(fallback: AppRoute): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    // router.replace accepts `Href` which is `string | HrefObject`.
    // AppRoute is a constrained string union of verified tab routes.
    router.replace(fallback);
  }
}
