import { SettingsMenu } from "@/components/settings/menu";
import { useDeviceLayout } from "@/lib/device-layout";
import { Redirect } from "expo-router";

export default function SettingsPage() {
  const { isWide } = useDeviceLayout();
  return isWide ? <Redirect href="/settings/account" /> : <SettingsMenu />;
}
