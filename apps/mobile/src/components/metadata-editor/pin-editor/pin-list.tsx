import { CatalystDivider, CatalystListItem, CatalystText } from "@/components/design-system";
import { cn } from "@/lib/utils";
import { ITEM_TYPE_LABELS, type EditablePin } from "@/models/epiclese-pin-editor";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { withUniwind } from "uniwind";

const UniChevronUp = withUniwind(ChevronUp);
const UniChevronDown = withUniwind(ChevronDown);
const UniTrash2 = withUniwind(Trash2);

type Props = {
  pins: EditablePin[];
  onSelect: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
};

type ActionProps = {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
};

const RowAction = ({ label, disabled = false, onPress, children }: ActionProps) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={6}
    className={cn("size-9 items-center justify-center", disabled && "opacity-30")}
  >
    {children}
  </Pressable>
);

export const PinList = ({ pins, onSelect, onMoveUp, onMoveDown, onRemove }: Props) => {
  if (pins.length === 0) {
    return (
      <CatalystText tone="muted" className="px-5 py-6 text-center leading-5">
        まだピンが設定されていません。写真をタップしてピンを追加してください
      </CatalystText>
    );
  }

  return (
    <View>
      {pins.map((pin, index) => {
        const number = index + 1;

        return (
          <View key={index}>
            {index > 0 && <CatalystDivider className="ml-14 w-auto" />}
            <CatalystListItem divided={false} onPress={() => onSelect(index)} className="gap-2 py-2 pr-2 pl-4">
              <View className="size-7 items-center justify-center rounded-full bg-light-surface-muted dark:bg-dark-surface-muted">
                <CatalystText variant="caption" className="font-bold">
                  {number}
                </CatalystText>
              </View>
              <View className="min-w-0 flex-1">
                <CatalystText variant="label" numberOfLines={1} tone={pin.name ? "default" : "muted"}>
                  {pin.name || "未設定のピン"}
                </CatalystText>
                <CatalystText variant="caption" tone="muted">
                  {ITEM_TYPE_LABELS[pin.type]}
                </CatalystText>
              </View>
              <RowAction label={`${number} 番のピンを上へ移動`} disabled={index === 0} onPress={() => onMoveUp(index)}>
                <UniChevronUp size={18} className="text-light-icon dark:text-dark-icon" />
              </RowAction>
              <RowAction
                label={`${number} 番のピンを下へ移動`}
                disabled={index === pins.length - 1}
                onPress={() => onMoveDown(index)}
              >
                <UniChevronDown size={18} className="text-light-icon dark:text-dark-icon" />
              </RowAction>
              <RowAction label={`${number} 番のピンを削除`} onPress={() => onRemove(index)}>
                <UniTrash2 size={18} className="text-light-error dark:text-dark-error" />
              </RowAction>
            </CatalystListItem>
          </View>
        );
      })}
    </View>
  );
};
