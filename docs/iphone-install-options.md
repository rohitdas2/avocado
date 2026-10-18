# Three iPhone installation options

Researched October 18, 2026 for Avocado's Expo SDK 58 app. These are options, not builds already produced.

| Option | Pros | Cons | Best fit |
| --- | --- | --- | --- |
| Local Xcode install, free Personal Team | No paid developer membership; test the actual Avocado app on your own iPhone. | Requires a Mac/Xcode and signing setup; free provisioning expires after seven days, requiring rebuild/reinstall. Debug development uses Metro. | Try it without paying. |
| EAS internal preview, ad hoc distribution | Own app icon; bundled JavaScript runs without Metro; direct installation link; EAS handles build/signing tasks. | Paid Apple membership; register the iPhone's UDID; adding devices needs another build or re-sign. | Personal daily testing before public distribution. |
| TestFlight | Easy installation and updates; suitable for friends/testers; no device-ID collection. | Paid Apple membership, App Store Connect setup and build processing; builds expire after 90 days; external testing requires initial beta review. | Sharing and release-style testing. |

Apple Developer Program enrollment is currently US$99 per membership year, with regional pricing. That membership supports both paid routes; it is not a separate fee for each route. EAS cloud builds have their own plan/allowance considerations, so no unlimited-free-build promise is made here.

Recommendation: choose local Xcode for a free first test; choose an EAS **preview** build to use Avocado personally without a development server; move to TestFlight when inviting testers. A development build and a preview build have different goals: the former supports live coding, while the latter bundles the app for testing.

All three still need the Flask API and PostgreSQL. For local testing, use the Mac's reachable LAN address in EXPO_PUBLIC_API_URL; the phone's 127.0.0.1 points to the phone. For use away from the Mac, host the shared API over HTTPS with persistent PostgreSQL and configure the app to use that origin. Sign in to the same Avocado account on both clients to share records. A signed iPhone build alone does not host the backend.

Current repo preparation: mobile/app.json has no ios.bundleIdentifier, there is no eas.json/project build configuration, and expo-dev-client is not installed. These need configuration for the chosen route; no purchase, enrollment, signing change, build upload, or device installation was performed for this research.

The old Expo Go assumption needs updating: current official physical-iOS instructions describe building Expo Go through EAS/TestFlight with paid Apple membership. That extra setup makes a direct Avocado build a better fit for this project. Simulator Expo Go access does not establish the physical-iPhone installation path.

Sources:

- [Expo local development builds](https://docs.expo.dev/develop/development-builds/introduction/?buildenv=build-locally)
- [Apple Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account/)
- [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Expo preview builds without Metro](https://docs.expo.dev/tutorial/eas/internal-distribution-builds/)
- [Apple TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Apple membership cost](https://developer.apple.com/programs/enroll/)
- [Current Expo Go setup for physical iOS](https://docs.expo.dev/get-started/set-up-your-environment/?device=physical&mode=expo-go&platform=ios)
