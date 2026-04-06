# EAS Build & Submit Notes

## Before Live Submission — Required Fields

The following fields in `eas.json` must be filled in before running a production submission build.
They require credentials from your Apple Developer account and Google Play Console.

### iOS (`submit.production.ios`)

| Field | Description | Where to find it |
|---|---|---|
| `ascAppId` | The numeric App Store Connect App ID (e.g. `1234567890`). Created automatically when you add a new app in [App Store Connect](https://appstoreconnect.apple.com). Leave blank until the app listing is created. | App Store Connect → My Apps → your app → App Information → Apple ID |
| `appleTeamId` | Your Apple Developer Team ID (e.g. `AB12CD34EF`). | [Apple Developer portal](https://developer.apple.com/account) → Membership → Team ID |
| `appleId` | Already set to `contact@inspectproof.com.au`. This is the Apple ID used to authenticate with App Store Connect. Confirm it matches the account with access to the app. | Apple Developer account email |

### Android (`submit.production.android`)

| Field | Description | Where to find it |
|---|---|---|
| `serviceAccountKeyPath` | Path to the Google Play service account JSON key file (currently `./google-play-service-account.json`). This file must be downloaded from the Google Play Console and placed in the `artifacts/mobile` directory before submitting. **Do not commit this file to version control.** | Google Play Console → Setup → API access → Create service account |
| `track` | Currently set to `internal`. Change to `alpha`, `beta`, or `production` when ready for wider release. | Google Play Console release tracks |

## App Store URL

The iOS App Store URL in email templates uses the placeholder `idAPP_STORE_ID_PLACEHOLDER`.
Once you have created the app listing in App Store Connect and obtained the numeric App ID,
set the `IOS_APP_URL` environment variable on the API server to the correct URL:

```
IOS_APP_URL=https://apps.apple.com/au/app/inspectproof/id<YOUR_APP_ID>
```

## Android Package Name

The Android package name is `com.planproof.inspectproof` — this must match the package name
registered in the Google Play Console exactly.
