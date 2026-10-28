import { CatalystDivider, CatalystListItem, CatalystText, CatalystTextField } from "@/components/design-system";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type EditablePin } from "@/models/epiclese-pin-editor";
import type { EpiclesePlatformResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { withUniwind } from "uniwind";

import { MetadataRow } from "../metadata-row";
import { PickerHeader } from "../picker-header";
import { FormField } from "../world-picker/form-field";
import { TEXT_INPUT_CLASS_NAME } from "../world-picker/world-form-step";

const UniCheck = withUniwind(Check);
const UniKeyboardAwareScrollView = withUniwind(KeyboardAwareScrollView);

type Patch = Partial<Pick<EditablePin, "type" | "name" | "externalUrl" | "description">>;

type Props = {
  pin: EditablePin;
  platform: EpiclesePlatformResponse | undefined;
  onChange: (patch: Patch) => void;
  onPickAuthor: () => void;
  onBackToSearch: () => void;
  onDelete: () => void;
  onBack: () => void;
};

// 新しいアイテムは保存時にサーバーが作る。ここでは入力をピンに書き込むだけ
export const ItemCreateStep = ({ pin, platform, onChange, onPickAuthor, onBackToSearch, onDelete, onBack }: Props) => {
  const insets = useSafeAreaInsets();

  return (
    <>
      <PickerHeader title="アイテムを新規作成" left={{ label: "戻る", onPress: onBack }} />
      <UniKeyboardAwareScrollView
        bottomOffset={24}
        contentContainerClassName="gap-6 py-5"
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={onBackToSearch} className="self-start px-5">
          <CatalystText tone="tint">検索に戻る</CatalystText>
        </Pressable>

        <View className="gap-2">
          <CatalystText variant="label" className="px-5">
            種類
          </CatalystText>
          <View>
            {ITEM_TYPES.map((type, i) => (
              <View key={type}>
                {i > 0 && <CatalystDivider className="ml-5 w-auto" />}
                <CatalystListItem
                  divided={false}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pin.type === type }}
                  onPress={() => onChange({ type })}
                  className="min-h-12 px-5"
                >
                  <CatalystText className="flex-1 text-base">{ITEM_TYPE_LABELS[type]}</CatalystText>
                  {pin.type === type && <UniCheck size={20} className="text-light-tint dark:text-dark-tint" />}
                </CatalystListItem>
              </View>
            ))}
          </View>
        </View>

        <View className="gap-6 px-5">
          <FormField label="名前">
            <CatalystTextField
              value={pin.name}
              onChangeText={(name) => onChange({ name })}
              placeholder="例：ネオンジャケット"
              maxLength={128}
              className={TEXT_INPUT_CLASS_NAME}
            />
          </FormField>
          <FormField label="作者" description={platform ? undefined : "先にプラットフォームを選択してください"}>
            <MetadataRow
              label="作者"
              value={pin.author?.name ?? "未選択"}
              disabled={!platform}
              onPress={onPickAuthor}
            />
          </FormField>
          <FormField label="販売ページ URL">
            <CatalystTextField
              value={pin.externalUrl ?? ""}
              onChangeText={(externalUrl) => onChange({ externalUrl })}
              placeholder="https://booth.pm/ja/items/..."
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              className={TEXT_INPUT_CLASS_NAME}
            />
          </FormField>
          <FormField label="説明">
            <CatalystTextField
              value={pin.description ?? ""}
              onChangeText={(description) => onChange({ description })}
              multiline
              maxLength={1024}
              className={TEXT_INPUT_CLASS_NAME}
            />
          </FormField>
          <Pressable onPress={onDelete} className="self-start py-2">
            <CatalystText tone="danger">ピンを削除</CatalystText>
          </Pressable>
        </View>
        {/* 末尾の入力欄がホームインジケーターに重ならないよう、下の安全領域ぶん余白を取る */}
        <View style={{ height: insets.bottom }} />
      </UniKeyboardAwareScrollView>
    </>
  );
};
