import { SettingsMenu } from "@/components/settings/menu";
import { CatalystAppHeader, renderCatalystStackHeader, headerSurfaceOptions } from "@/components/navigation/app-header";
import { useDeviceLayout } from "@/lib/device-layout";
import { Stack, router } from "expo-router";
import { View } from "react-native";

export const unstable_settings = { anchor: "index" };

export default function SettingsLayout() {
  const { isWide: split } = useDeviceLayout();
  return (
    <View className="flex-1 flex-row bg-light-background dark:bg-dark-background">
      {split && (
        <View className="w-80 border-r border-light-divider dark:border-dark-divider">
          <CatalystAppHeader
            compact
            sideInsets={false}
            title="設定とプライバシー"
            canGoBack
            onBack={() => router.dismissTo("/(drawer)/(tabs)")}
          />
          <SettingsMenu sidebar />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Stack
          screenOptions={{
            ...headerSurfaceOptions,
            headerBackTitle: "戻る",
            header: (props) => {
              if (props.route.name === "index") {
                return (
                  <CatalystAppHeader
                    title="設定とプライバシー"
                    canGoBack
                    onBack={() => props.navigation.getParent()?.goBack()}
                  />
                );
              }
              if (!split && !props.back) {
                return (
                  <CatalystAppHeader title={props.options.title} canGoBack onBack={() => router.replace("/settings")} />
                );
              }
              return renderCatalystStackHeader({
                ...props,
                back: split && !props.route.name.includes("/") ? undefined : props.back,
              });
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              title: "設定とプライバシー",
              headerBackTitle: "戻る",
            }}
          />
          <Stack.Screen name="account" options={{ title: "アカウント", headerBackTitle: "戻る" }} />
          <Stack.Screen name="account/delete" options={{ title: "アカウント削除", headerBackTitle: "戻る" }} />
          <Stack.Screen name="notifications" options={{ title: "通知", headerBackTitle: "戻る" }} />
          <Stack.Screen name="display" options={{ title: "表示", headerBackTitle: "戻る" }} />
          <Stack.Screen
            name="accessibility"
            options={{
              title: "アクセシビリティ",
              headerBackTitle: "戻る",
            }}
          />
          <Stack.Screen name="privacy" options={{ title: "プライバシー", headerBackTitle: "戻る" }} />
          <Stack.Screen name="activitypub" options={{ title: "ActivityPub 連合", headerBackTitle: "戻る" }} />
          {__DEV__ ? <Stack.Screen name="debug" options={{ title: "デバッグ", headerBackTitle: "戻る" }} /> : null}
          <Stack.Screen name="legal" options={{ title: "法的情報", headerBackTitle: "戻る" }} />
          <Stack.Screen
            name="legal/licenses"
            options={{
              title: "オープンソースソフトウェア",
              headerBackTitle: "戻る",
            }}
          />
          <Stack.Screen
            name="custom-reactions"
            options={{
              title: "カスタムリアクション",
              headerBackTitle: "戻る",
            }}
          />
        </Stack>
      </View>
    </View>
  );
}
