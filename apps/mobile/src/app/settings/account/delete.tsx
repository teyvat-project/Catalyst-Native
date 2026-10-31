import { CatalystButton, CatalystButtonText, CatalystText, CatalystTextField } from "@/components/design-system";
import { accountAtom } from "@/models/atoms/account";
import * as Credential from "@/models/credential";
import { router } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

// 誤タップで削除しないよう、この文言を入力するまで削除ボタンを押せないようにする
const CONFIRMATION_TEXT = "削除する";

export default function DeleteAccountPage() {
  const [account, setAccount] = useAtom(accountAtom);
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isDeleteDisabled = !account || confirmation.trim() !== CONFIRMATION_TEXT || isDeleting;

  const handleDelete = useCallback(async () => {
    if (!account || isDeleteDisabled) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const token = account.credential.client.accessToken;
      const res = await fetch(`https://api.natsuneko.com/egeria/v1/me`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        setErrorMessage("アカウントを削除できませんでした。時間をおいて再度お試しください。");
        return;
      }

      Alert.alert(
        "アカウントの削除を開始しました。投稿したデータが完全に消えるまで最大24時間かかることがあります",
      );
      await Credential.signOut(account.credential);
      setAccount(null);
      router.dismissAll();
    } catch {
      setErrorMessage("アカウントを削除できませんでした。時間をおいて再度お試しください。");
    } finally {
      setIsDeleting(false);
    }
  }, [account, isDeleteDisabled, setAccount]);

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-light-surface-muted dark:bg-dark-background"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-2 px-5 pt-4">
        <CatalystText variant="subtitle" className="text-[15px] font-semibold">
          アカウントを削除すると、元に戻すことはできません
        </CatalystText>
        <CatalystText tone="subtle" className="text-sm leading-5">
          投稿やプロフィールなど、アカウントに関連するデータはすべて削除されます。データが完全に消えるまで最大24時間かかることがあります。
        </CatalystText>
      </View>

      <View className="pt-6">
        <CatalystText variant="caption" tone="subtle" className="px-5 pb-2">
          確認のため「{CONFIRMATION_TEXT}」と入力してください
        </CatalystText>
        <View className="min-h-14 justify-center bg-light-background px-5 py-3 dark:bg-dark-surface">
          <CatalystTextField
            className="rounded-none bg-transparent p-0 leading-5"
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isDeleting}
            placeholder={CONFIRMATION_TEXT}
            returnKeyType="done"
          />
        </View>
        {errorMessage && (
          <CatalystText variant="caption" tone="danger" className="px-5 pt-2 leading-4">
            {errorMessage}
          </CatalystText>
        )}
      </View>

      <View className="px-5 pt-6 pb-8">
        <CatalystButton
          tone="danger"
          className="disabled:opacity-50"
          onPress={handleDelete}
          disabled={isDeleteDisabled}
        >
          {isDeleting ? <ActivityIndicator size="small" /> : <CatalystButtonText>アカウントを削除</CatalystButtonText>}
        </CatalystButton>
      </View>
    </KeyboardAwareScrollView>
  );
}
