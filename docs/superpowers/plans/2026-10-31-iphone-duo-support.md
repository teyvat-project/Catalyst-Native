# iPhone Duo 対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 画面幅でレイアウトを切り替えるようにして、iPhone Duo の開閉（466×678pt ⇄ 951×669pt）で崩れないようにする。

**Architecture:** `src/lib/device-layout.ts` に、幅から列数、バナーの高さ、幅のクラスを求める純粋関数と、`useWindowDimensions()` を包む `useDeviceLayout()` を置き、`Platform.isPad` による定数を置き換える。横に並ぶタブは、画面幅ではなく自身の `onLayout` の幅を使い、幅が変わったら選択中のページに合わせ直す。画面上部に固定で表示されるものだけ、セーフエリアの左右の余白を入れる。

**Tech Stack:** Expo 58 / expo-router, React Native 0.88, `react-native-safe-area-context` 5.10, `@shopify/flash-list` v2, Uniwind, react-native-toast-message, jest (jest-expo)

**Spec:** `docs/superpowers/specs/2026-10-31-iphone-duo-support-design.md`

## Global Constraints

- 作業ディレクトリは `apps/mobile`。ブランチは今の `claude/iphone-duo-support-f05e6a`。PR は `develop` 向け。
- 変更は JS だけ。新しい依存やネイティブモジュールは追加しない。
- 列数: `columnsFor(width, target, min) = max(min, floor(width / target))`。投稿 `(200, 3)`、メディア `(270, 2)`、リスト `(400, 1)`。
- 広い画面の判定: `isWide = width >= 768`。
- バナーの高さ: `headerHeightFor(width, height) = min(width / 3, height * 0.3)`。プロフィールだけ `max(136, …)`。
- 画面上部に固定で表示されるものだけ `insets.left` / `insets.right` を入れる。スクロールする中身には入れない。`useSafeAreaInsets()` の値を `style` で渡す（既存の `paddingTop: insets.top` と同じ書き方）。
- スタイルは基本的に Uniwind のユーティリティクラス。インラインの `style` は、セーフエリアや実測の幅など実行時の値にだけ使う。動的に組み立てたクラス名は Uniwind が生成しないので、クラス名は完全な文字列で書く。
- テストは `pnpm test`（jest）。`pnpm typecheck` の `Property 'className' does not exist` は既知の誤検知（pnpm の hoisting の制限）で、それ以外の新しいエラーを出さないこと。`pnpm lint` を通すこと。
- コミットは署名付き。本文の末尾に空行を挟んで `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- シミュレータでの確認: iPhone Duo `16EE269E-2393-471C-8A8E-A88D85C88310`（iOS 27.2）。Xcode 27.2 ではネイティブのビルドが通らないので、インストール済みの .app と `pnpm with-env expo start --dev-client --port 8081` で確認する（`CI=1` を付けるとファイルの変更を監視しないので付けない）。開閉は Xcode > Open Developer Tool > Device Hub の画面上のボタンでしかできないので、開発者に頼む。内側の画面のスクリーンショットは `xcrun simctl io <udid> screenshot --display=747DCAB0-5DA4-4EB9-B346-11F061DC799A <file>`。

## Review Focus

- **最初の `onLayout` で幅が 0**: 幅 0 を使うと `offset / 0` で `NaN` になり、ページが表示されなくなる。幅が 0 以下の `onLayout` は無視する（Task 3 のテスト）。
- **ページの途中までスワイプしたまま開閉する**: 指を離す前に幅が変わっても、`activeIndex` のページに合わせ直されること（Task 3 のテスト）。
- **選択中が最後のタブのときに幅が縮む**: 合わせ直したオフセットが新しい内容の幅を超えて、最後のページの途中で止まらないこと（Task 3 のテスト）。
- **列数が 6 を超えるほど広い画面**（外部ディスプレイなど、幅 1890pt 以上でメディアが 7 列以上）: 幅のクラスの表は 6 列までなので、`widthClassFor` は 6 を超えたら `w-1/6` を返す（Task 1 のテスト）。
- **実行中に FlashList の `numColumns` が変わる**: 開閉したあと、グリッドの行が新しい列数で組み直され、古い列数のマスが残らないこと（Task 2 のシミュレータでの確認）。

---

### Task 1: 幅から列数とバナーの高さを求める

**Files:**
- Modify: `src/lib/device-layout.ts`
- Test: `src/lib/device-layout.test.ts`（新規）

**Interfaces:**
- Produces:
  - `columnsFor(width: number, target: number, min: number): number`
  - `headerHeightFor(width: number, height: number): number`
  - `widthClassFor(columns: number): string` — `1 → "w-full"`、`2 → "w-1/2"`、`3 → "w-1/3"`、`4 → "w-1/4"`、`5 → "w-1/5"`、`6 以上 → "w-1/6"`
  - `useDeviceLayout(): { postColumns: number; mediaColumns: number; listColumns: number; isWide: boolean; headerHeight: number }`
  - 既存の `isIPad`、`POST_COLUMNS`、`MEDIA_COLUMNS`、`LIST_COLUMNS` はこの Task では残す（Task 2 で削除）。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { columnsFor, headerHeightFor, widthClassFor } from "./device-layout";

describe("columnsFor", () => {
  // 幅: iPhone 402 / Duo 畳 466 / iPad mini 744 / iPad 11" 834 / Duo 開 951 / iPad 13" 1032 / iPad 13" 横 1376
  const widths = [402, 466, 744, 834, 951, 1032, 1376];

  it.each([
    ["投稿", 200, 3, [3, 3, 3, 4, 4, 5, 6]],
    ["メディア", 270, 2, [2, 2, 2, 3, 3, 3, 5]],
    ["リスト", 400, 1, [1, 1, 1, 2, 2, 2, 3]],
  ])("%s の列数が spec の表どおりになる", (_, target, min, expected) => {
    expect(widths.map((w) => columnsFor(w, target, min))).toEqual(expected);
  });

  it("幅 0 のときは最小列数を返す", () => {
    expect(columnsFor(0, 200, 3)).toBe(3);
  });
});

describe("headerHeightFor", () => {
  it.each([
    [402, 874, 134],
    [466, 678, 466 / 3],
    [951, 669, 669 * 0.3],
    [1032, 1376, 344],
    [1376, 1032, 1032 * 0.3],
  ])("%d×%d の高さは %d", (width, height, expected) => {
    expect(headerHeightFor(width, height)).toBeCloseTo(expected);
  });
});

describe("widthClassFor", () => {
  it("列数に対応する幅のクラスを返す", () => {
    expect([1, 2, 3, 4, 5, 6].map(widthClassFor)).toEqual(["w-full", "w-1/2", "w-1/3", "w-1/4", "w-1/5", "w-1/6"]);
  });

  it("6 列を超えたら w-1/6 を返す", () => {
    expect(widthClassFor(9)).toBe("w-1/6");
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm test src/lib/device-layout.test.ts`
Expected: FAIL（`columnsFor` などが export されていない）

- [ ] **Step 3: Interfaces の 4 つを `src/lib/device-layout.ts` に実装する**

`widthClassFor` は 6 要素の配列を引く。`useDeviceLayout` は `useWindowDimensions()` の `width` / `height` から `useMemo` で計算する。

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm test src/lib/device-layout.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/device-layout.ts src/lib/device-layout.test.ts
git commit -S -m "feat(layout): 画面幅から列数とバナーの高さを求める"
```

### Task 2: 列数と設定画面の左右分割を幅で決める

**Files:**
- Modify: `src/lib/device-layout.ts`（`isIPad`、`POST_COLUMNS`、`MEDIA_COLUMNS`、`LIST_COLUMNS` を削除）
- Modify（`useDeviceLayout()` に置き換え）: `src/app/gallery.tsx`、`src/app/settings/_layout.tsx`、`src/app/settings/index.tsx`、`src/components/explorer/users/list.tsx`、`src/components/explorer/contests/list.tsx`、`src/components/explorer/items/list.tsx`、`src/components/explorer/albums/list.tsx`、`src/components/profile/follow-list.tsx`、`src/components/profile/remote-follower-list.tsx`、`src/components/profile/albums.tsx`、`src/components/profile/timeline.tsx`、`src/components/profile/gallery.tsx`、`src/components/profile/placeholder.tsx`、`src/components/album/detail-page.tsx`、`src/components/theme/list.tsx`

**Interfaces:**
- Consumes: Task 1 の `useDeviceLayout()`、`widthClassFor()`

- [ ] **Step 1: 列数の定数を置き換える**

モジュール直下の `const COLUMNS = POST_COLUMNS` のような定数を消し、コンポーネントの中で `const { postColumns } = useDeviceLayout()` を使う。列数を使う `useCallback` / `useMemo` の依存配列に列数を足す。

- [ ] **Step 2: 列数で幅のクラスを選んでいる箇所を置き換える**

- `explorer/items/list.tsx:76`: `MEDIA_COLUMNS === 3 ? "w-1/3 p-1.5" : "w-1/2 p-1.5"` → `cn(widthClassFor(mediaColumns), "p-1.5")`
- `profile/follow-list.tsx:85`、`profile/remote-follower-list.tsx:82`: `LIST_COLUMNS === 2 ? "w-1/2" : "w-full"` → `widthClassFor(listColumns)`
- `profile/placeholder.tsx:79`: `isIPad ? "w-1/2 px-3 py-3" : "w-full py-3"` → `cn(widthClassFor(listColumns), listColumns > 1 && "px-3", "py-3")`

- [ ] **Step 3: 設定画面の左右分割を `isWide` にする**

`app/settings/_layout.tsx:11` と `app/settings/index.tsx:8` の `isIPad && width >= 768` を `useDeviceLayout().isWide` にする。不要になった `useWindowDimensions` の import は消す。

- [ ] **Step 4: 残りを削除して、テスト、型、lint を確かめる**

`device-layout.ts` から 4 つの定数と `Platform` の import を消す。

Run: `grep -rn "isIPad\|POST_COLUMNS\|MEDIA_COLUMNS\|LIST_COLUMNS" src`
Expected: 何も出ない

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: テストはすべて PASS。typecheck は `Property 'className'` 以外のエラーなし。lint はエラーなし。

- [ ] **Step 5: シミュレータで列数を確かめる**

開いた状態で、プロフィールの投稿が 4 列、ギャラリーが 3 列、検索のユーザー一覧とコンテスト一覧が 2 列、設定画面が左右分割になること。畳むと 3 / 2 / 1 列とメニュー形式に戻り、古い列数のマスが残らないこと（Review Focus）。残る場合は、その FlashList の `key` に列数を含める。

- [ ] **Step 6: コミット**

```bash
git add -A src
git commit -S -m "feat(layout): 列数と設定画面の左右分割を iPad かどうかではなく画面幅で決める"
```

### Task 3: 開閉してもタブとページがずれないようにする

**Files:**
- Modify: `src/components/design-system/tabs.tsx`
- Test: `src/components/design-system/tabs.test.tsx`（新規）

**Interfaces:**
- Produces: `CatalystTabs` の props は変えない。

- [ ] **Step 1: 失敗するテストを書く**

`jest.spyOn(FlatList.prototype, "scrollToOffset")` で呼び出しを見て、ページャーを包む `View`（`testID="catalyst-tabs-pager"` を付ける）に `fireEvent(pager, "layout", { nativeEvent: { layout: { width, height: 600, x: 0, y: 0 } } })` で幅を送る。`react-native-gesture-handler/jestSetup` が `jest.setup.js` で読み込まれていなければ、テストファイルで読み込む。

- `幅が変わると選択中のページに合わせ直す`: タブ 3 つ、`defaultIndex={1}`。幅 951 → 466 の `layout` を送ると、最後の `scrollToOffset` が `{ offset: 466, animated: false }` で呼ばれる。
- `最後のタブを選んだまま幅が縮んでも最後のページに合う`: `defaultIndex={2}`、951 → 466 で `{ offset: 932, animated: false }`。
- `スワイプ途中で幅が変わっても activeIndex に合わせる`: `defaultIndex={0}`、幅 951 で `FlatList` に `scroll`（`contentOffset.x = 500`）を送ってから 466 の `layout` を送ると、`{ offset: 0, animated: false }`。
- `幅 0 の layout は無視する`: 幅 951 のあとに幅 0 を送っても、`scrollToOffset` は新たに呼ばれない。

均等幅のタブバーの下線の位置は、jest ではレイアウトが計算されないので、Task 4 のシミュレータでの確認で見る。

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm test src/components/design-system/tabs.test.tsx`
Expected: FAIL

- [ ] **Step 3: ページャーの幅を実測にして、幅が変わったら合わせ直す**

- `pageWidth` を state にする。初期値は `useWindowDimensions().width`。ページャーを包む `View` の `onLayout` で、幅が 0 より大きく今の値と違うときだけ更新する。
- `pageWidth` が変わったら（`useEffect`）、`flatListRef.current?.scrollToOffset({ offset: activeIndex * pageWidth, animated: false })` と `scrollX.setValue(activeIndex * pageWidth)` を呼ぶ。
- `FlatList` に `getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}` を渡す。
- `renderItem` のページ幅、`inputRange`、`handleMomentumScrollEnd` の割り算、タブバーを横スクロールさせる判定（`left + screenWidth`）を `pageWidth` にする。
- 均等幅のタブバーは、タブバーの `onLayout` で測った幅（`barWidth`、初期値は `pageWidth`）から `tabWidth = barWidth / tabs.length` を求める。

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm test src/components/design-system/tabs.test.tsx`
Expected: PASS

- [ ] **Step 5: シミュレータで確かめる**

ホームの「グローバル」と検索の「コンテスト」を選んだ状態で、開く→畳む→開くと切り替え、太字のタブ、下線、表示中のページがそろっていること。メタデータ編集の写真ページャー（`metadata-editor/photo-pager.tsx`）も 2 枚目を表示したまま開閉し、ずれる場合は同じ方法（実測の幅、合わせ直し、`getItemLayout`）で直す。メディアカルーセルが崩れる場合は直さず、Task 6 の報告に書く。

- [ ] **Step 6: コミット**

```bash
git add src/components/design-system/tabs.tsx src/components/design-system/tabs.test.tsx src/components/metadata-editor/photo-pager.tsx
git commit -S -m "fix(tabs): 画面幅が変わってもタブとページがずれないようにする"
```

### Task 4: 画面上部の UI をステータス表示に重ねない

**Files:**
- Modify: `src/components/navigation/app-header.tsx:43`、`src/components/design-system/tabs.tsx`（タブバーの外側の `View`）、`src/app/(drawer)/(tabs)/explore.tsx`（検索欄の行）、`src/components/profile/overlay.tsx:87`、`src/components/profile/profile-page.tsx`（`:283` のタブバー、`:328` の上に張り付くタブバー、`:311` の「…」ボタン）、`src/components/profile/tabs.tsx`、`src/components/fleet/viewer.tsx`（`:440`、`:475`、`:492`、`:509`、`:517`）、`src/components/design-system/toast.tsx`（`CatalystToastCard`）

**Interfaces:**
- Consumes: なし（`useSafeAreaInsets()` を各コンポーネントで呼ぶ）

- [ ] **Step 1: 畳んだ状態の `insets` を測る**

`app/(drawer)/(tabs)/_layout.tsx` の `CustomTabBar` に `console.log("[DUO-PROBE]", JSON.stringify({ insets, window: Dimensions.get("window") }))` を一時的に入れ、畳んだ状態でアプリをリロードして Metro のログを読む。読んだら行を消す。
Expected: right（または top）に 0 でない値が入っている。どの辺にも値が入らない場合は、ここで止めて開発者に報告する（spec の方針の見直しが必要）。

- [ ] **Step 2: 上部に固定で表示されるものに左右の余白を入れる**

- `app-header.tsx:43`、`overlay.tsx:87`、`tabs.tsx` のタブバー、`explore.tsx` の検索欄の行、`profile-page.tsx:283` と `:328` のタブバー: 既存の `style` に `paddingLeft: insets.left, paddingRight: insets.right` を足す。
- `profile/tabs.tsx`: `tabWidth = screenWidth / tabs.length` をやめて、自身の `onLayout` の幅（0 より大きいときだけ更新）から求める。余白を入れた親の内側の幅で下線がそろうようにするため。
- `profile-page.tsx:311` の「…」ボタンと、`fleet/viewer.tsx` の `right-N` で置いている各ボタン: `right-N` のクラスを消し、`style` に `right: insets.right + N×4` を入れる（`right-4` なら `insets.right + 16`、`right-24` なら `insets.right + 96`）。`fleet/viewer.tsx:440` と `:517` のヘッダーは `left` / `right` に `insets.left` / `insets.right` を足す。
- `toast.tsx`: `CatalystToastCard` で、`position === "top"` のときだけ `marginLeft: insets.left, marginRight: insets.right` を入れる。

- [ ] **Step 3: 型と lint を確かめる**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: Task 2 と同じ

- [ ] **Step 4: シミュレータで確かめる**

開いた状態と畳んだ状態の両方で、共通ヘッダー、ホームと検索の上のタブバー、検索欄、プロフィールのナビバー、上に張り付くタブバー、「…」ボタン、「いいね」タブが、時刻と Wi-Fi の表示と重ならないこと。普通の iPhone では見た目が変わらないこと（`insets.left` / `insets.right` は 0）。全画面の画像ビューアの閉じるボタンが重なる場合は直さず、Task 6 の報告に書く。

- [ ] **Step 5: コミット**

```bash
git add -A src
git commit -S -m "fix(layout): 画面上部の UI をセーフエリアの左右に収めて、ステータス表示と重ならないようにする"
```

### Task 5: バナーの大きさを画面に合わせる

**Files:**
- Modify: `src/components/profile/header.tsx:47`、`src/components/profile/header.tsx:96`、`src/app/contest/[slug].tsx:208`、`src/components/contest/card.tsx:81`、`src/components/contest/card.tsx:85`

**Interfaces:**
- Consumes: Task 1 の `useDeviceLayout().headerHeight`

- [ ] **Step 1: 全幅のバナーの高さを置き換える**

- `profile/header.tsx:47` と `:96`: `Math.max(136, screenWidth / 3)` → `Math.max(136, headerHeight)`。
- `app/contest/[slug].tsx:208`: `screenWidth / 3` → `headerHeight`。コメント `// 1500:500 = 3:1` は「3:1。ただし高さは画面の 30% まで」に直す。
- 使わなくなった `screenWidth` と `useWindowDimensions` の import は消す。

- [ ] **Step 2: コンテスト一覧のカードを縦横比で決める**

`contest/card.tsx:81` と `:85` の `h-32` を `aspect-[3/1]` にする。

- [ ] **Step 3: 型と lint を確かめる**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: Task 2 と同じ

- [ ] **Step 4: シミュレータで確かめる**

開いた状態で、プロフィールとコンテスト詳細のバナーが約 201pt、検索のコンテスト一覧のカードが 3:1（2 列で 1 枚あたり約 150pt）になること。畳んだ状態ではバナーが約 155pt で、今と変わらないこと。

- [ ] **Step 5: コミット**

```bash
git add -A src
git commit -S -m "fix(layout): 広い画面でバナーが大きくなりすぎたり切れたりしないようにする"
```

### Task 6: 通しの確認と PR

**Files:** なし（確認のみ）

- [ ] **Step 1: 自動のチェックを通す**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: Task 2 と同じ

- [ ] **Step 2: spec の「シミュレータでの確認」の 7 項目を通しで確かめる**

開いた状態と畳んだ状態のスクリーンショットを撮り、項目ごとに結果を記録する。普通の iPhone のシミュレータ（例: iPhone 17 Pro）でも、ホーム、プロフィール、検索、設定を撮って、変更前と見た目が変わっていないことを確かめる。

- [ ] **Step 3: 対象外にしたものを整理する**

メディアカルーセルや全画面の画像ビューアで崩れや重なりが見つかった場合は、症状と再現手順を PR の本文に「既知の問題（別タスク）」として書く。

- [ ] **Step 4: 開発者の確認を待ってから push と draft PR**

push と PR の作成は、開発者の確認を得てから行う。PR は `develop` 向けの draft。本文の末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
