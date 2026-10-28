import {
  addPin,
  applyItem,
  findInvalidPinIndex,
  isPinUntouched,
  MAX_PINS,
  movePin,
  movePinDown,
  movePinUp,
  normalizePins,
  removePin,
  toPinAuthor,
  updateNewItem,
  type EditablePin,
} from "@/models/epiclese-pin-editor";
import type { Media } from "@/models/sdk-types";
import type { EpicleseAuthorResponse, EpiclesePlatformResponse } from "@natsuneko-laboratory/catalyst-sdk";
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { withUniwind } from "uniwind";

import { PickerHeader } from "../picker-header";
import { AuthorFormStep } from "../world-picker/author-form-step";
import { AuthorSearchStep } from "../world-picker/author-search-step";
import { ItemCreateStep } from "./item-create-step";
import { ItemSearchStep } from "./item-search-step";
import { PinCanvas } from "./pin-canvas";
import { PinList } from "./pin-list";

const UniGestureHandlerRootView = withUniwind(GestureHandlerRootView);

type Step = "canvas" | "item-search" | "item-create" | "author-filter" | "author-search" | "author-form";

type Props = {
  visible: boolean;
  media: Media;
  pins: EditablePin[];
  platform: EpiclesePlatformResponse | undefined;
  platforms: EpiclesePlatformResponse[];
  onCancel: () => void;
  onDone: (pins: EditablePin[]) => void;
};

// 1 枚の写真のピンを編集する。「完了」まで編集画面には反映しないので、開いている間は下書きを持つ
export const PinEditorModal = ({ visible, media, pins, platform, platforms, onCancel, onDone }: Props) => {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(pins);
  const [step, setStep] = useState<Step>("canvas");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // アイテム検索の作者の絞り込み。ピンごとではなく、モーダルを開いている間は持ち越す
  const [authorFilter, setAuthorFilter] = useState<EpicleseAuthorResponse | null>(null);
  const activePin = activeIndex !== null ? draft[activeIndex] : undefined;

  useEffect(() => {
    if (!visible) return;

    setDraft(pins);
    setStep("canvas");
    setActiveIndex(null);
    setAuthorFilter(null);
    // 開いた時点の値から始めればよく、開いている間に親の値が変わっても下書きは作り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // 既存アイテムを選んだピンと何も入力していないピンは検索から、新規作成の途中のピンはその入力から開く
  const openPin = useCallback((index: number, pin: EditablePin) => {
    setActiveIndex(index);
    setStep(pin.reference || isPinUntouched(pin) ? "item-search" : "item-create");
  }, []);

  const updateActive = useCallback(
    (updater: (pin: EditablePin) => EditablePin) => {
      if (activeIndex === null) return;
      setDraft((prev) => prev.map((pin, i) => (i === activeIndex ? updater(pin) : pin)));
    },
    [activeIndex],
  );

  const handleAdd = useCallback(
    (point: { x: number; y: number }) => {
      const next = addPin(draft, point);
      if (next.limited) {
        Alert.alert("エラー", `写真1枚につき最大${MAX_PINS}件までピンを設定できます`);
        return;
      }

      setDraft(next.pins);
      openPin(next.pins.length - 1, next.pins[next.pins.length - 1]);
    },
    [draft, openPin],
  );

  // フォームからピン編集画面に戻る。新しく足したまま何も入力していないピンは捨てる (Web 版と同じ)
  const backToCanvas = useCallback(() => {
    setDraft((prev) =>
      activeIndex !== null && prev[activeIndex] && isPinUntouched(prev[activeIndex])
        ? removePin(prev, activeIndex)
        : prev,
    );
    setActiveIndex(null);
    setStep("canvas");
  }, [activeIndex]);

  const handleDone = useCallback(() => {
    const normalized = normalizePins(draft);
    const invalidIndex = findInvalidPinIndex(normalized);
    if (invalidIndex !== -1) {
      Alert.alert("エラー", `${invalidIndex + 1} 番のピンの入力が足りません`);
      return;
    }

    onDone(normalized);
  }, [draft, onDone]);

  // iOS の pageSheet は下へのスワイプでも閉じようとする (onRequestClose)。ピンのドラッグや
  // スクロールの勢いで閉じてしまい、置いたピンを失わないよう、変更があれば確かめる
  const confirmCancel = useCallback(() => {
    if (JSON.stringify(draft) === JSON.stringify(pins)) {
      onCancel();
      return;
    }

    Alert.alert("変更を破棄しますか？", undefined, [
      { text: "編集を続ける", style: "cancel" },
      { text: "破棄", style: "destructive", onPress: onCancel },
    ]);
  }, [draft, onCancel, pins]);

  const deleteActive = useCallback(() => {
    if (activeIndex !== null) setDraft((prev) => removePin(prev, activeIndex));
    setActiveIndex(null);
    setStep("canvas");
  }, [activeIndex]);

  const selectAuthor = useCallback(
    (author: EpicleseAuthorResponse) => {
      updateActive((pin) => updateNewItem(pin, { author: toPinAuthor(author) }));
      setStep("item-create");
    },
    [updateActive],
  );

  // Android の戻る操作はモーダル全体ではなく 1 つ前のステップに戻す
  const handleRequestClose = useCallback(() => {
    switch (step) {
      case "canvas":
        return confirmCancel();
      case "author-form":
        return setStep("author-search");
      case "author-search":
        return setStep("item-create");
      case "author-filter":
        return setStep("item-search");
      case "item-search":
      case "item-create":
        return backToCanvas();
    }
  }, [backToCanvas, confirmCancel, step]);

  return (
    <Modal
      testID="pin-editor-modal"
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleRequestClose}
    >
      <UniGestureHandlerRootView className="flex-1 bg-light-background dark:bg-dark-background">
        {step === "canvas" ? (
          <>
            <PickerHeader
              title={`ピン ${draft.length}/${MAX_PINS}`}
              left={{ label: "キャンセル", onPress: onCancel }}
              right={{ label: "完了", onPress: handleDone }}
            />
            {/* ピンのドラッグが外側のスクロールと取り合わないよう、写真はスクロールさせず一覧だけをスクロールする */}
            <PinCanvas
              media={media}
              pins={draft}
              activeIndex={activeIndex}
              onAdd={handleAdd}
              onSelect={(index) => openPin(index, draft[index])}
              onMove={(index, point) => setDraft((prev) => movePin(prev, index, point))}
            />
            {/* 一覧の末尾がホームインジケーターに重ならないよう、下の安全領域ぶん余白を取る */}
            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom }}>
              <PinList
                pins={draft}
                onSelect={(index) => openPin(index, draft[index])}
                onMoveUp={(index) => setDraft((prev) => movePinUp(prev, index))}
                onMoveDown={(index) => setDraft((prev) => movePinDown(prev, index))}
                onRemove={(index) => setDraft((prev) => removePin(prev, index))}
              />
            </ScrollView>
          </>
        ) : null}
        {step === "item-search" && activePin && (
          <ItemSearchStep
            pin={activePin}
            authorFilter={authorFilter}
            onPickAuthorFilter={() => setStep("author-filter")}
            onSelect={(item) => {
              updateActive((pin) => applyItem(pin, item));
              setActiveIndex(null);
              setStep("canvas");
            }}
            onCreateNew={() => setStep("item-create")}
            onDelete={deleteActive}
            onBack={backToCanvas}
          />
        )}
        {step === "item-create" && activePin && (
          <ItemCreateStep
            pin={activePin}
            platform={platform}
            onChange={(patch) => updateActive((pin) => updateNewItem(pin, patch))}
            onPickAuthor={() => setStep("author-search")}
            onBackToSearch={() => setStep("item-search")}
            onDelete={deleteActive}
            onBack={backToCanvas}
          />
        )}
        {step === "author-filter" && (
          <AuthorSearchStep
            title="作者で絞り込む"
            allOption={{
              label: "すべての作者",
              onSelect: () => {
                setAuthorFilter(null);
                setStep("item-search");
              },
            }}
            onBack={() => setStep("item-search")}
            onSelect={(author) => {
              setAuthorFilter(author);
              setStep("item-search");
            }}
          />
        )}
        {step === "author-search" && platform && (
          <AuthorSearchStep
            platform={platform}
            title="作者"
            onBack={() => setStep("item-create")}
            onSelect={selectAuthor}
            onRegister={() => setStep("author-form")}
          />
        )}
        {step === "author-form" && platform && (
          <AuthorFormStep
            platform={platform}
            platforms={platforms}
            onBack={() => setStep("author-search")}
            onSaved={selectAuthor}
          />
        )}
      </UniGestureHandlerRootView>
    </Modal>
  );
};
