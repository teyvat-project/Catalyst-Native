# メタデータ編集 Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写真ごとのピン (位置付きのアイテム参照) を、専用のピン編集画面で追加・移動・並べ替え・削除し、既存アイテムを選ぶか新しいアイテムを作って保存できるようにする。

**Architecture:** 座標変換とピン操作・入力確認は新しい `src/models/epiclese-pin-editor.ts` の純粋関数にする。編集画面の「ピン」行から、フルスクリーンの `Modal` でピン編集画面を開く。モーダルは下書きを持ち、「完了」で入力を確認してから編集画面の `items[index].reference` に反映する。ピンのフォーム (アイテム検索 / 新規作成 / 作者検索・登録) はモーダル内のステップで、作者のステップは Phase 2 のものを流用する。

**Tech Stack:** Expo / expo-router 58, React Native `Modal`, react-native-gesture-handler 3.3 (`Gesture.Pan`) + reanimated 4.7 (`runOnJS`), Jotai, Uniwind, `@natsuneko-laboratory/catalyst-sdk` 2026.10.26-beta.3, jest (jest-expo) + @testing-library/react-native v14

**Spec:** `docs/superpowers/specs/2026-10-28-metadata-editor-phase3-design.md` (前提: Phase 1 / 2 の spec)

## Global Constraints

- ブランチ `claude/metadata-phase3-pins` (Phase 2 の `claude/metadata-phase2-text` の上)。PR はベースを Phase 2 のブランチにした通常の draft PR。GitHub の stacked PR 機能は使わない。
- 保存は全置換のまま。ピン編集は写真の `reference` だけを差し替え、`platform` / `world` / `users` / `privacyMetadata` は変えない。
- サーバーの制約 (spec「サーバー側の制約」): 1 枚 20 件、`x` / `y` は 0〜10000 の整数、`order` 0〜19、`name` 1〜128 文字、`description` 1024 文字まで、`externalUrl` は URL、新しいアイテム (`reference` なし) は `author` 必須。
- SDK: アイテム検索 `client.epiclese.v1.items.get({ query: { q, author? }, throwOnError: true })` → `data.items` (`EpicleseItemResponse`)。作者検索・登録は Phase 2 と同じ。
- 型: `type EditablePin = EditableMediaMetadata["reference"][number]` (送信形式のピン)。ピンの作者は `{ id, name, platformIdentifier, platform: author.platform?.id ?? "" }` (Web 版 `onSelectAuthor` と同じ)。
- ナビゲーションフックは `expo-router` から。ボトムシートは RN `Modal` の裏に出るので、モーダル内の選択肢はその場に行を並べる (Phase 2 と同じ)。
- モーダル内でジェスチャーを使うので、モーダルの中身を `GestureHandlerRootView className="flex-1"` で包む。
- スタイルは Uniwind と `@/components/design-system`。計算した位置 (`left` / `top`) と大きさだけはインラインの style でよい。
- 文言 (spec で固定):
  - 行「ピン」、値「n 件」/「未設定」
  - ピン編集画面: ヘッダー「キャンセル」「ピン n/20」「完了」、0 件「まだピンが設定されていません。写真をタップしてピンを追加してください」、未入力の名前「未設定のピン」、操作「上へ移動」「下へ移動」「ピンを削除」
  - 上限: `Alert.alert("エラー", "写真1枚につき最大20件までピンを設定できます")`
  - 入力不足: `Alert.alert("エラー", "n 番のピンの入力が足りません")`
  - アイテム選択: タイトル「アイテムを選択」、「作者で絞り込む」(値: 作者名 /「すべての作者」)、検索「アイテム名で検索」、0 件「該当するアイテムが見つかりません」、末尾「新しいアイテムを作成」
  - 新規作成: タイトル「アイテムを新規作成」、「検索に戻る」、「種類」(アバター / 衣装 / アクセサリー / ヘアー / ギミック / その他)、「名前」(プレースホルダ「例：ネオンジャケット」)、「作者」(未設定時「先にプラットフォームを選択してください」)、「販売ページ URL」(プレースホルダ `https://booth.pm/ja/items/...`)、「説明」
- 画面テストは `src/app` の外に置く。RNTL v14 の `render` / `fireEvent` は `await`。design-system の index 経由で reanimated を読むため、テストでは `@/components/design-system/switch` と `.../tabs` をモックする (Phase 2 と同じ)。ジェスチャーは `react-native-gesture-handler/jestSetup` を読み込む。
- tsc の `Property 'className'` 系は既知の誤検知。他の新規エラーは出さない。
- コミットは署名付き。本文末尾に空行を挟んで `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **レターボックスを含めて座標を計算する** (縦長写真の左右余白をタップしたら、端に寄ったピンが付く): 余白のタップは無視、描画矩形の中だけで 0〜10000 に正規化。→ Task 1 の `toNormalizedPoint` のテスト (横長・縦長・余白)。
2. **小数の座標を送る** (zod の `int()` で保存全体が 400): 変換結果は必ず整数に丸め、0〜10000 に収める。→ Task 1 のテスト `結果は整数で 0〜10000 に収まる`。
3. **作者の無い新しいアイテムを送る** (サーバーが例外を投げて保存全体が失敗): 「完了」で確認して止める。→ Task 1 の `findInvalidPinIndex` のテストと Task 3 の画面テスト。
4. **削除・並べ替えのあとに `order` が飛ぶ / 重複する**: 毎回 0 から振り直す。→ Task 1 のテスト。
5. **新しいピンを何も入力せずに戻ると、空のピンが残る** (名前が空なので完了で必ず止まり、ユーザーには消し方が分かりにくい): 戻ったら捨てる。→ Task 4 の画面テスト。

---

### Task 1: ピン編集の純粋関数

**Files:**
- Create: `apps/mobile/src/models/epiclese-pin-editor.ts`
- Test: `apps/mobile/src/models/epiclese-pin-editor.test.ts`

**Interfaces:**
- Produces:
  - `type EditablePin = EditableMediaMetadata["reference"][number]`
  - `type ContentRect = { x: number; y: number; width: number; height: number }`
  - `const MAX_PINS = 20`, `const PIN_COORDINATE_MAX = 10000`
  - `const ITEM_TYPES = ["avatar", "cloth", "accessory", "hair", "gimmick", "other"] as const`、`const ITEM_TYPE_LABELS: Record<EditablePin["type"], string>` (spec の和名)
  - `getContentRect(box: { width: number; height: number }, image: { width: number; height: number }): ContentRect` (contain の実描画矩形。`media-pin-overlay.tsx` と同じ計算)
  - `toNormalizedPoint(rect: ContentRect, point: { x: number; y: number }): { x: number; y: number; inBounds: boolean }` (整数、0〜10000 に clamp)
  - `toDisplayPoint(rect: ContentRect, pin: { x: number; y: number }): { left: number; top: number }`
  - `addPin(pins: EditablePin[], point: { x: number; y: number }): { pins: EditablePin[]; limited: boolean }` (新しいピンは末尾、`type: "other"`, `name: ""`)
  - `movePin(pins, index, point): EditablePin[]`、`removePin(pins, index): EditablePin[]`、`movePinUp(pins, index)`、`movePinDown(pins, index)` (どれも `order` を 0 から振り直す)
  - `applyItem(pin: EditablePin, item: EpicleseItemResponse): EditablePin`
  - `updateNewItem(pin: EditablePin, patch: Partial<Pick<EditablePin, "type" | "name" | "externalUrl" | "description" | "author">>): EditablePin` (`reference` を外す。空文字の `externalUrl` / `description` は `undefined` に)
  - `toPinAuthor(author: EpicleseAuthorResponse): NonNullable<EditablePin["author"]>`
  - `isPinUntouched(pin: EditablePin): boolean` (Web 版と同じ: `reference`・`author`・`externalUrl` が無く、`description` と `name` が空白だけ)
  - `findInvalidPinIndex(pins: EditablePin[]): number` (最初の無効なピンの添字、無ければ -1。規則は spec「3. 入力の確認」)
  - `setPins(item: EditableMediaMetadata, pins: EditablePin[]): EditableMediaMetadata` (`reference` だけを差し替える)

- [ ] **Step 1: 失敗するテストを書く**
  - `getContentRect` / `toNormalizedPoint`:
    - 横長 (画像 2000×1000、箱 400×400): 矩形 `{ x: 0, y: 100, width: 400, height: 200 }`。`(200, 200)` → `{ x: 5000, y: 5000, inBounds: true }`。`(200, 50)` → `inBounds: false`。
    - 縦長 (画像 1000×2000、箱 400×400): 矩形 `{ x: 100, y: 0, width: 200, height: 400 }`。`(50, 200)` → `inBounds: false`。`(300, 400)` → `{ x: 10000, y: 10000, inBounds: true }`。
    - `結果は整数で 0〜10000 に収まる`: `(133.3, 177.7)` の結果が `Number.isInteger` で、範囲外の点 (`(-10, 999)`) も 0〜10000 に clamp。
  - `toDisplayPoint`: 横長の矩形で `{ x: 5000, y: 0 }` → `{ left: 200, top: 100 }`。
  - `addPin`: 末尾に `{ x, y, order: n, type: "other", name: "" }`。20 件に足すと `limited: true` で変わらない。
  - `removePin` / `movePinUp` / `movePinDown`: 3 件 (order 0,1,2) の中央を削除 → order が `[0, 1]`。末尾を上へ → 順番が入れ替わり order が `[0, 1, 2]`。先頭の上へ・末尾の下へは同じ配列 (`toEqual`)。
  - `applyItem`: 作者付きのピンに `{ id: "i-1", type: "cloth", name: "Jacket", description: "", externalUrl: null, ... }` → `reference: "i-1"`, `type: "cloth"`, `name: "Jacket"`, `description` と `externalUrl` と `author` が `undefined`。`x` / `y` / `order` は元のまま。
  - `updateNewItem`: `reference` 付きのピンに `{ name: "X" }` → `reference` が `undefined`、`name: "X"`。`{ externalUrl: "" }` → `externalUrl` が `undefined`。
  - `isPinUntouched`: 新しいピン → true。名前 `"  "` だけ → true。名前・作者・URL・説明・reference のいずれかがあれば false。
  - `setPins`: `platform` / `world` / `users` / `privacyMetadata` 付きの写真に 2 件のピンを入れる → `reference` だけが変わり、他の 4 項目は `toEqual` で元のまま (往復)。
  - `findInvalidPinIndex`: すべて `reference` あり → -1。2 番目が名前なし → 1。作者なし・`externalUrl: "booth.pm/1"`・説明 1025 文字・名前 129 文字 → それぞれ無効。`reference` があれば名前が空でも有効。

- [ ] **Step 2: 失敗を確認**

Run: `cd apps/mobile && pnpm test src/models/epiclese-pin-editor.test.ts`
Expected: FAIL (`Cannot find module './epiclese-pin-editor'`)

- [ ] **Step 3: 実装** — 座標は `Math.round` してから `Math.min(10000, Math.max(0, v))`。URL の判定は `/^https?:\/\/\S+$/`。

- [ ] **Step 4: 成功を確認**

Run: `cd apps/mobile && pnpm test src/models/epiclese-pin-editor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/models/epiclese-pin-editor.ts apps/mobile/src/models/epiclese-pin-editor.test.ts
git commit -m "feat(metadata): ピン編集の座標変換と操作を追加"
```

---

### Task 2: 作者検索ステップを流用できるようにする

**Files:**
- Modify: `apps/mobile/src/components/metadata-editor/world-picker/author-search-step.tsx`
- Test: `apps/mobile/src/components/metadata-editor/world-picker/author-search-step.test.tsx`

**Interfaces:**
- Produces: `AuthorSearchStep({ platform?: EpiclesePlatformResponse; title?: string; allOption?: { label: string; onSelect: () => void }; onBack; onSelect; onRegister?: () => void })`
  - `platform` が無ければ `query` に `platform` を付けない (全プラットフォーム)
  - `allOption` があれば結果の先頭に行を出す
  - `onRegister` が無ければ「見つからない場合は作者を登録」を出さない
  - `title` の既定は今の「ワールド作者」。Phase 2 の呼び出しは変えない

- [ ] **Step 1: 失敗するテストを書く** (Phase 2 の `index.test.tsx` と同じモック)
  - `platform なしなら全プラットフォームで検索する`: `authors.get` が `{ query: { q: "" }, throwOnError: true }` で呼ばれる (`platform` キーが無い)。
  - `allOption を先頭に出し、選ぶと onSelect が呼ばれる`: 「すべての作者」をタップ → `allOption.onSelect` が 1 回。
  - `onRegister が無ければ登録の導線を出さない`: 「見つからない場合は作者を登録」が無い。

- [ ] **Step 2: 失敗を確認**

Run: `cd apps/mobile && pnpm test src/components/metadata-editor/world-picker/author-search-step.test.tsx`
Expected: FAIL (`platform` が必須で `undefined.id` / 「すべての作者」が見つからない)

- [ ] **Step 3: 実装して成功を確認**

Run: `cd apps/mobile && pnpm test src/components/metadata-editor`
Expected: PASS (Phase 2 の既存テストを含む)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/metadata-editor/world-picker
git commit -m "refactor(metadata): 作者検索をプラットフォーム指定なしでも使えるようにする"
```

---

### Task 3: ピン編集画面 (写真・ピン・一覧・完了)

**Files:**
- Create: `apps/mobile/src/components/metadata-editor/pin-editor/index.tsx` (モーダル、下書き、ステップ)
- Create: `apps/mobile/src/components/metadata-editor/pin-editor/pin-canvas.tsx` (写真 + ピン、タップで追加、ドラッグで移動)
- Create: `apps/mobile/src/components/metadata-editor/pin-editor/pin-list.tsx`
- Test: `apps/mobile/src/components/metadata-editor/pin-editor/index.test.tsx`
- Modify: `apps/mobile/src/app/status/[id]/metadata.tsx` (「ピン」行とモーダル)

**Interfaces:**
- Consumes: Task 1 の関数、Phase 2 の `PickerHeader`
- Produces:
  - `PinEditorModal({ visible: boolean; media: Media; pins: EditablePin[]; platform: EpiclesePlatformResponse | undefined; platforms: EpiclesePlatformResponse[]; onCancel: () => void; onDone: (pins: EditablePin[]) => void })`。内部に `step: "canvas" | "item-search" | "item-create" | "author-filter" | "author-search" | "author-form"` と `activeIndex: number | null` を持つ (`item-*` / `author-*` は Task 4 で中身を足す)。開くたびに `pins` から下書きを作り `"canvas"` から始める。
  - `PinCanvas({ media: Media; pins: EditablePin[]; activeIndex: number | null; onAdd: (point: { x: number; y: number }) => void; onSelect: (index: number) => void; onMove: (index: number, point: { x: number; y: number }) => void })`。写真全体を `Pressable` (`testID="pin-canvas"`) にし、`onPress` の `nativeEvent.locationX/Y` と `onLayout` の大きさから `toNormalizedPoint` で `onAdd` (範囲外は何もしない)。ピンは番号付きの丸 (`accessibilityLabel` 「n 番のピン」)、タップで `onSelect`、`GestureDetector` + `Gesture.Pan()` でドラッグ中は表示だけ動かし、離したら `onMove` (`runOnJS`)。
  - `PinList({ pins; onSelect: (index) => void; onMoveUp; onMoveDown; onRemove })`

- [ ] **Step 1: 失敗するテストを書く** (`index.test.tsx`。`react-native-gesture-handler/jestSetup` を読み込み、Phase 2 のモックに加えて `expo-image` をモック。`PinCanvas` の大きさは `fireEvent(canvas, "layout", { nativeEvent: { layout: { width: 400, height: 400 } } })` で与え、写真は 1000×1000)
  - `21 件目は追加せず Alert を出す`: 20 件で開き、`fireEvent.press(canvas, { nativeEvent: { locationX: 200, locationY: 200 } })` → `Alert.alert("エラー", "写真1枚につき最大20件までピンを設定できます")`、「完了」の `onDone` は 20 件。
  - `入力が足りないピンがあると完了で反映しない`: 2 件目が名前なし・reference なしのピンで開き、「完了」→ `onDone` は呼ばれず `Alert.alert("エラー", "2 番のピンの入力が足りません")`。
  - `キャンセルでは反映しない`: 1 件削除してから「キャンセル」→ `onCancel` が呼ばれ `onDone` は呼ばれない。
  - `並べ替えと削除で order を振り直して返す`: 3 件 (すべて reference あり) で「3 番のピン」の「上へ移動」→ 「完了」の `onDone` の `order` が `[0, 1, 2]` で、2 件目と 3 件目の `reference` が入れ替わっている。

- [ ] **Step 2: 失敗を確認**

Run: `cd apps/mobile && pnpm test src/components/metadata-editor/pin-editor/index.test.tsx`
Expected: FAIL (`Cannot find module '.'`)

- [ ] **Step 3: 実装**
  - キャンバスの写真は `getCdnUrl({ src: media.url, variant: "post-details", width, aspect })`、高さは画面高さの 45%、幅は画面幅。`contentFit="contain"`。
  - 写真をタップして追加したら、その新しいピンを `activeIndex` にして `"item-search"` へ (Task 4 まではステップが空でもよいが、キャンバスに戻る手段として `"canvas"` へ戻す「戻る」を置く)。
  - 「完了」: `findInvalidPinIndex(draft)` が -1 でなければ Alert で止める。-1 なら `onDone(draft)`。
  - ヘッダー中央は「ピン {draft.length}/20」。
  - 画面: 「写っている人」の下に `MetadataRow label="ピン"` (値「n 件」/「未設定」)。開いて `onDone` で `updateCurrent((item) => setPins(item, pins))`。

- [ ] **Step 4: 成功を確認**

Run: `cd apps/mobile && pnpm test src/components/metadata-editor/pin-editor/index.test.tsx`
Expected: PASS

- [ ] **Step 5: 確認して Commit**

Run: `cd apps/mobile && pnpm test && pnpm lint` (`metadata-screen.test.tsx` のモックに `pin-editor` を足す)
Expected: PASS / 新規エラーなし

```bash
git add apps/mobile/src/components/metadata-editor/pin-editor "apps/mobile/src/app/status/[id]/metadata.tsx" apps/mobile/src/components/metadata-editor/metadata-screen.test.tsx
git commit -m "feat(metadata): ピン編集画面を追加"
```

---

### Task 4: ピンのフォーム (アイテム選択・新規作成)

**Files:**
- Create: `apps/mobile/src/components/metadata-editor/pin-editor/item-search-step.tsx`
- Create: `apps/mobile/src/components/metadata-editor/pin-editor/item-create-step.tsx`
- Modify: `apps/mobile/src/components/metadata-editor/pin-editor/index.tsx`
- Test: `apps/mobile/src/components/metadata-editor/pin-editor/index.test.tsx` (追記)

**Interfaces:**
- Consumes: Task 1 の `applyItem`, `updateNewItem`, `toPinAuthor`, `isPinUntouched`, `ITEM_TYPES`, `ITEM_TYPE_LABELS`、Task 2 の `AuthorSearchStep`、Phase 2 の `AuthorFormStep`, `FormField`, `MetadataRow`, `TEXT_INPUT_CLASS_NAME`, `useDebouncedSearch`
- Produces:
  - `ItemSearchStep({ pin: EditablePin; authorFilter: EpicleseAuthorResponse | null; onPickAuthorFilter: () => void; onSelect: (item: EpicleseItemResponse) => void; onCreateNew: () => void; onDelete: () => void; onBack: () => void })`
  - `ItemCreateStep({ pin: EditablePin; platform: EpiclesePlatformResponse | undefined; onChange: (patch) => void; onPickAuthor: () => void; onBackToSearch: () => void; onDelete: () => void; onBack: () => void })`

- [ ] **Step 1: 失敗するテストを書く** (`index.test.tsx` に追記)
  - `何も入力せずに戻った新しいピンは消える`: 0 件で開き、写真をタップ → アイテム選択のステップの「戻る」→ 「完了」の `onDone` が `[]`。
  - `アイテムを選ぶとピンに入る`: 写真をタップ → `items.get` のモックが返す「Jacket」をタップ → 「完了」の `onDone` の 1 件目が `reference: "i-1"`, `name: "Jacket"`。
  - `新規作成で作者が無ければ完了で止まる`: 写真をタップ →「新しいアイテムを作成」→ 名前「X」を入力 →「戻る」→「完了」→ `Alert.alert("エラー", "1 番のピンの入力が足りません")`。

- [ ] **Step 2: 失敗を確認**

Run: `cd apps/mobile && pnpm test src/components/metadata-editor/pin-editor/index.test.tsx`
Expected: FAIL (新しい 3 件。アイテム選択のステップがまだ無い)

- [ ] **Step 3: 実装**
  - フォームを開く先: `activeIndex` のピンが `reference` あり、または `isPinUntouched` なら `"item-search"`、それ以外 (名前か作者が入った新規作成の途中) は `"item-create"`。
  - `ItemSearchStep`: 「作者で絞り込む」は `MetadataRow` (値は `authorFilter?.name ?? "すべての作者"`)。`authorFilter` はモーダルの state (ピンごとには持たない)。検索は `useDebouncedSearch(q, fetchItems)`、`author: authorFilter?.id` を付ける。結果の行は「名前（作者名）」(作者が無ければ名前だけ) と `ITEM_TYPE_LABELS[type]`。選択中 (`pin.reference`) に ✓。0 件は「該当するアイテムが見つかりません」、取得失敗は「読み込みに失敗しました」+「再読み込み」。
  - 作者で絞り込む → `"author-filter"` で `AuthorSearchStep` (`platform` なし、`title="作者で絞り込む"`, `allOption={{ label: "すべての作者", onSelect: () => 絞り込みを外して "item-search" へ }}`、`onRegister` なし)。
  - `ItemCreateStep`: 種類はチェック付きの行 6 つ。名前 (`maxLength={128}`)、作者行 (`platform` が無ければ無効で「先にプラットフォームを選択してください」)、販売ページ URL (`autoCapitalize="none"`, `keyboardType="url"`)、説明 (`multiline`, `maxLength={1024}`)。入力はすべて `updateNewItem`。スクロールは `withUniwind(KeyboardAwareScrollView)` (Phase 2 と同じ)。
  - 作者行 → `"author-search"` (`AuthorSearchStep` に写真の `platform`, `title="作者"`, `onRegister` で `"author-form"`)。選んだら `updateNewItem(pin, { author: toPinAuthor(author) })` して `"item-create"` へ。`"author-form"` は Phase 2 の `AuthorFormStep` をそのまま使い、保存で同じく `"item-create"` へ。
  - 両ステップの「ピンを削除」→ `removePin` して `"canvas"`。「戻る」→ `"canvas"`。**`"canvas"` に戻るとき、`activeIndex` のピンが `isPinUntouched` なら捨てる。**
  - Android の戻る (`onRequestClose`) は 1 つ前のステップへ: author-form → author-search → item-create、author-filter → item-search、item-search / item-create → canvas (未入力のピンは捨てる)、canvas → `onCancel`。

- [ ] **Step 4: 成功を確認**

Run: `cd apps/mobile && pnpm test src/components/metadata-editor/pin-editor/index.test.tsx`
Expected: PASS (Task 3 の 4 件を含む 7 件)

- [ ] **Step 5: 確認して Commit**

Run: `cd apps/mobile && pnpm test && pnpm lint`
Expected: PASS / 新規エラーなし

```bash
git add apps/mobile/src/components/metadata-editor/pin-editor
git commit -m "feat(metadata): ピンにアイテムを選ぶ・新しく作るフォームを追加"
```

---

### Task 5: 通しの確認と stacked PR

**Files:** なし (問題があれば該当 Task のファイルを直す)

- [ ] **Step 1: 全テストと lint と型**

Run: `cd apps/mobile && pnpm test && pnpm lint && npx tsc --noEmit -p .`
Expected: PASS / 新規エラーなし

- [ ] **Step 2: シミュレータで spec「手動確認」を通す** (サインインが必要。未サインインならバンドルが通り編集画面が開くことまで確認し、残りを PR に書く)

- [ ] **Step 3: push して draft PR**

```bash
git push -u origin claude/metadata-phase3-pins
gh pr create --draft --repo teyvat-project/Catalyst-Native --base claude/metadata-phase2-text --head claude/metadata-phase3-pins
```

本文の先頭に「#78 (Phase 2) の上に積んだ PR。#77 → #78 のマージ後にベースを付け替える」と書く。
