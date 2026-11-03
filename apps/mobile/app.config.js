// @ts-check
const pkg = require("./package.json");

// サーバー側 (apple-app-site-association / assetlinks.json) にも同じパスが要る。
// サーバーが未対応でも、iOS と Android 15 以降はブラウザで開くだけなので、アプリ側は先に足しておける
const APP_LINK_PATH_PREFIXES = [
  "/status/",
  "/album/",
  "/smart-album/",
  "/contest/",
  "/tags/",
  "/themes/",
  "/items/",
  "/user/",
  "/archive/",
  "/@",
];

// 前方一致だと `/archives` のような別のページまで受け取ってしまうものは、完全一致で登録する
const APP_LINK_EXACT_PATHS = ["/archive"];

/** @param {string[]} paths */
const withLocales = (paths) => [...paths, ...paths.flatMap((path) => [`/ja${path}`, `/en${path}`])];

const APP_LINK_DATA = [
  ...withLocales(APP_LINK_PATH_PREFIXES).map((pathPrefix) => ({ pathPrefix })),
  ...withLocales(APP_LINK_EXACT_PATHS).map((path) => ({ path })),
].map((matcher) => ({
  scheme: "https",
  host: "catalyst.natsuneko.com",
  ...matcher,
}));

/**
 * @param {import('expo/config').ConfigContext} context
 * @returns {import('@expo/config-types').ExpoConfig}
 */
module.exports = ({ config }) => {
  const identifier = "com.natsuneko.catalyst";
  const environment = process.env.APP_ENV || process.env.NODE_ENV || "production";
  const associatedDomains = [
    ...new Set(
      [
        ...(config.ios?.associatedDomains ?? []),
        "applinks:catalyst.natsuneko.com",
        environment === "development" ? "applinks:catalyst.stg.natsuneko.com" : null,
      ]
        .filter(Boolean)
        .map((w) => `${w}`),
    ),
  ];

  return {
    ...config,
    name: "Catalyst",
    slug: "catalyst-native",
    scheme: identifier,
    version: pkg.version,
    icon: "./assets/images/icon.png",
    userInterfaceStyle: "automatic",
    ios: {
      ...config.ios,
      associatedDomains,
      bundleIdentifier: identifier,
      googleServicesFile: "./GoogleService-Info.plist",
      supportsTablet: true,
      config: {
        usesNonExemptEncryption: false,
      },
      entitlements: {
        "aps-environment": environment === "production" ? "production" : "development",
        "com.apple.developer.networking.wifi-info": true,
      },
      infoPlist: {
        CFBundleDevelopmentRegion: "ja_JP",
        LSApplicationQueriesSchemes: [
          "googlechrome",
          "googlechromes",
          "firefox",
          "microsoft-edge-https",
          "brave",
          "ddgQuickLink",
        ],
        UIBackgroundModes: ["remote-notification"],
        UISupportedInterfaceOrientations: [
          //
          "UIInterfaceOrientationPortrait",
        ],
        "UISupportedInterfaceOrientations~ipad": [
          "UIInterfaceOrientationPortrait",
          "UIInterfaceOrientationPortraitUpsideDown",
          "UIInterfaceOrientationLandscapeLeft",
          "UIInterfaceOrientationLandscapeRight",
        ],
      },
    },
    android: {
      ...config.android,
      adaptiveIcon: {
        backgroundColor: "#F3B4CF",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      blockedPermissions: [
        //
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
      ],
      googleServicesFile: "./google-services.json",
      intentFilters: [
        ...(config.android?.intentFilters ?? []),
        {
          action: "VIEW",
          autoVerify: true,
          data: APP_LINK_DATA,
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
      package: identifier,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
      bundler: "metro",
    },
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#F3B3CF",
          dark: {
            backgroundColor: "#F3B3CF",
          },
        },
      ],
      "expo-secure-store",
      [
        "@sentry/react-native/expo",
        {
          url: "https://sentry.io/",
          project: "catalyst-native",
          organization: "natsuneko-laboratory",
        },
      ],
      [
        "expo-asset",
        {
          assets: [
            //
            "assets/images/ui",
          ],
        },
      ],
      [
        "@react-native-firebase/app",
        {
          ios: {
            disableSPM: true,
          },
        },
      ],
      "@react-native-firebase/messaging",
      "@react-native-async-storage/expo-with-async-storage",
      [
        "@luccasr73/with-rn-image-crop-picker",
        {
          PhotoLibraryUsageDescription:
            "ユーザーが端末内の写真を選択し、 Catalyst 上で投稿・共有するために写真ライブラリへアクセスします。",
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
          },
          ios: {
            forceStaticLinking: ["RNFBApp", "RNFBMessaging"],
            useFrameworks: "static",
            ccacheEnabled: true,
            buildReactNativeFromSource: true,
          },
        },
      ],
      [
        "expo-image-picker",
        {
          microphonePermission: false,
          cameraPermission: false,
        },
      ],
      ["expo-file-system", {}],
      [
        "expo-media-library",
        {
          photosPermission: "画像を保存するために写真ライブラリへアクセスします。",
          savePhotosPermission: "画像を写真ライブラリに保存するためにアクセスします。",
          isAccessMediaLocationEnabled: false,
        },
      ],
      ["expo-font", {}],
      "@react-native-community/datetimepicker",
      "@natsuneko-laboratory/react-native-twitter-text",
      "@sentry/react-native",
      "expo-eas-ipad-support",
    ],
    extra: {
      router: {},
      eas: {
        projectId: "695c4d2f-513a-40fd-9e9a-20f0d77a50c1",
      },
    },
  };
};
