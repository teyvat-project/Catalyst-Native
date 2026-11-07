import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "emoji_frequency_v2";
const MAX_COUNT = 30;

type EmojiType = "unicode" | "url";

interface FrequencyItem {
  type: EmojiType;
  value: string;
  id: string;
  timestamp: number;
  count: number;
}

async function getItems(): Promise<FrequencyItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FrequencyItem[];
  } catch {
    return [];
  }
}

async function saveItems(items: FrequencyItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function recordUnicodeUsage(emoji: string): Promise<void> {
  await recordUsage("unicode", emoji, emoji);
}

export async function recordUrlUsage(id: string, url: string): Promise<void> {
  await recordUsage("url", url, id);
}

async function recordUsage(
  type: EmojiType,
  value: string,
  id: string,
): Promise<void> {
  const items = await getItems();
  const existingIndex = items.findIndex((item) => item.id === id);

  if (existingIndex >= 0) {
    items.splice(existingIndex, 1);
  }

  items.unshift({ type, value, id, timestamp: Date.now(), count: 1 });

  if (items.length > MAX_COUNT) {
    items.length = MAX_COUNT;
  }

  await saveItems(items);
}

export async function getRecentItems(): Promise<FrequencyItem[]> {
  return getItems();
}
