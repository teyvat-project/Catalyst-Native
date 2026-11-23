import {
  CatalystButton,
  CatalystButtonIcon,
  CatalystButtonText,
  CatalystText,
  CatalystTextField,
} from "@/components/design-system";
import { accountAtom } from "@/models/atoms/account";
import { passphraseUnlockRevisionAtomFamily } from "@/models/atoms/passphrase";
import * as Credential from "@/models/credential";
import type { CatalystStatusV1_1 } from "@/models/sdk-types";
import { useAtom, useSetAtom } from "jotai";
import { LogIn } from "lucide-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { withUniwind } from "uniwind";

const UniLogIn = withUniwind(LogIn);

type Props = {
  statusId: string;
  authorId?: string;
  onUnlocked: (status: CatalystStatusV1_1) => void;
};

export const PassphraseUnlockForm = ({ statusId, authorId, onUnlocked }: Props) => {
  const [account, setAccount] = useAtom(accountAtom);
  const bumpUnlockRevision = useSetAtom(passphraseUnlockRevisionAtomFamily(authorId ?? ""));
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleLogin = useCallback(async () => {
    const { credential, isLoggedIn, user } = await Credential.login();
    if (isLoggedIn && user) {
      setAccount({ user, credential });
    }
  }, [setAccount]);

  const handleSubmit = useCallback(async () => {
    if (!account || isPending || passphrase.trim().length === 0) return;

    setIsPending(true);
    setError(null);
    try {
      // 正規化はサーバーが行うので、入力をそのまま送る
      const result = await account.credential.client.catalyst.v1.status.id.unlock.create({
        path: { id: statusId },
        body: { passphrase },
      });

      if (result.data) {
        onUnlocked(result.data.status);
        if (authorId) bumpUnlockRevision((revision) => revision + 1);
      } else if (result.response?.status === 403) {
        setError("合言葉が違います");
      } else if (result.response?.status === 429) {
        setError("入力回数が上限に達しました。しばらくしてからお試しください");
      } else {
        setError("解除に失敗しました");
      }
    } catch {
      setError("解除に失敗しました");
    } finally {
      setIsPending(false);
    }
  }, [account, authorId, bumpUnlockRevision, isPending, onUnlocked, passphrase, statusId]);

  if (!account) {
    return (
      <CatalystButton tone="secondary" onPress={handleLogin}>
        <CatalystButtonIcon>
          <UniLogIn />
        </CatalystButtonIcon>
        <CatalystButtonText>ログインして合言葉を入力</CatalystButtonText>
      </CatalystButton>
    );
  }

  return (
    <View className="w-full max-w-sm gap-2">
      <View className="flex-row items-center gap-2">
        <CatalystTextField
          value={passphrase}
          onChangeText={setPassphrase}
          placeholder="合言葉"
          accessibilityLabel="合言葉"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!isPending}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          className="min-h-11 flex-1 rounded-lg border border-light-border bg-light-background px-3 dark:border-dark-border dark:bg-dark-background"
        />
        <CatalystButton onPress={handleSubmit} disabled={isPending || passphrase.trim().length === 0}>
          <CatalystButtonText>解除</CatalystButtonText>
        </CatalystButton>
      </View>
      {error ? (
        <CatalystText variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </CatalystText>
      ) : null}
    </View>
  );
};
