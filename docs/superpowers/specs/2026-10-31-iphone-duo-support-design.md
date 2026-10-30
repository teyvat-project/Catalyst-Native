# iPhone Duo 対応: 幅で切り替えるレイアウト

- 日付: 2026-10-31
- 対象: `apps/mobile`
- 検証環境: Xcode 27.2 / iOS 27.2 の iPhone Duo シミュレータ

## 背景

iPhone Duo は折りたたみの iPhone で、畳むと外側の画面、開くと内側の画面を使う。シミュレータで測った値は次のとおり。

| 状態 | 解像度 (px) | 論理サイズ (pt) | 向き |
| --- | --- | --- | --- |
| 畳んだ状態 (外側) | 1398×2034 | 約 466×678 | 縦長 |
| 開いた状態 (内側) | 2853×2007 | 951×669 | **横長** |

- 内側の画面は、アプリの `UISupportedInterfaceOrientations`（iPhone は縦向きのみ）に関係なく横長で描画される。
- 開いても閉じてもアプリは再起動されず、JS の状態は引き継がれる。`useWindowDimensions()` は新しいサイズに追従する。
- `Platform.isPad` は false（iPhone 扱い）。
- 開いた状態のセーフエリアは `{ top: 0, right: 84, bottom: 34, left: 0 }`。時刻と Wi-Fi の表示は右上（画面上端から約 100pt まで）にあり、セーフエリアでは右側の余白 84pt として報告される。

## 見つかった問題

シミュレータで確認した問題。開発者の目視確認でも、1〜3 は同じものが見つかっている。

1. **開閉するとタブとページがずれる**: ホームで「グローバル」を選んだまま畳むと、太字は「グローバル」なのに、下線と中身が「フォロー中」に戻る。検索で「コンテスト」を開いたまま畳むと、ページが途中で止まり、隣のページが見える。
2. **コンテスト一覧のバナーの縦横比がおかしい**: `components/contest/card.tsx` は高さを `h-32`（128pt）に固定しているので、幅 951pt では縦横比が約 7.4:1 になり、上下が大きく切れる。
3. **列数が広い画面に合っていない**: 列数を `Platform.isPad` で決めているので、開いた Duo（951pt）でもスマホと同じ列数になり、プロフィールのグリッドは 1 マス約 317pt になる。
4. **ステータス表示が上部の UI に重なる**: 共通ヘッダー、上のタブバー、検索欄、プロフィールの「…」ボタンと「いいね」タブが、時刻と Wi-Fi の表示の下に隠れる。
5. **バナーが画面を占めすぎる**: プロフィールとコンテスト詳細のバナーは `幅 / 3` なので、開いた Duo では 317pt になり、高さ 669pt の画面の半分近くを占める。

## 方針

- iPad と Duo を区別せず、**画面幅で**レイアウトを切り替える。`Platform.isPad` による分岐はなくす。
- 列数は「1 マスの目標幅」から計算する。
- ステータス表示との重なりは、セーフエリアの左右の余白を**画面上部に固定で表示されるものだけ**に入れて避ける。スクロールする中身には入れない。
- 新しい依存やネイティブモジュールは追加しない。変更は JS だけ。

## 設計

### 1. 列数を幅から計算する (`lib/device-layout.ts`)

定数の `isIPad`、`POST_COLUMNS`、`MEDIA_COLUMNS`、`LIST_COLUMNS` を削除し、純粋な計算関数とフックに置き換える。

```ts
export const columnsFor = (width: number, target: number, min: number) =>
  Math.max(min, Math.floor(width / target));

export const useDeviceLayout = () => {
  const { width, height } = useWindowDimensions();
  return useMemo(
    () => ({
      postColumns: columnsFor(width, 200, 3),
      mediaColumns: columnsFor(width, 270, 2),
      listColumns: columnsFor(width, 400, 1),
      isWide: width >= 768,
      headerHeight: headerHeightFor(width, height),
    }),
    [width, height],
  );
};
```

目標幅は、普通の iPhone、畳んだ Duo、iPad 11 インチの縦向きで今と同じ列数になるように選んだ。

| 種類 | 目標幅 | 最小 | iPhone 402 | Duo 畳 466 | iPad mini 744 | iPad 11" 834 | Duo 開 951 | iPad 13" 1032 | iPad 13" 横 1376 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 投稿 | 200 | 3 | 3 | 3 | 3 (今 4) | 4 | 4 | 5 (今 4) | 6 |
| メディア | 270 | 2 | 2 | 2 | 2 (今 3) | 3 | 3 | 3 | 5 |
| リスト | 400 | 1 | 1 | 1 | 1 (今 2) | 2 | 2 | 2 | 3 |

「(今 N)」は、今の `isPad` による列数から変わるところ。1 マスの大きさで決めるので、iPad mini は列数が減り、iPad 13 インチの投稿は 1 列増える。

使っている側の変更（13 ファイル、24 か所）:

- `const COLUMNS = POST_COLUMNS` のようなモジュール直下の定数をやめて、コンポーネントの中で `useDeviceLayout()` を呼ぶ。対象は `profile/timeline`、`profile/gallery`、`profile/placeholder`、`album/detail-page`、`app/gallery`、`explorer/*/list`、`profile/follow-list`、`profile/remote-follower-list`、`profile/albums`、`theme/list`。
- FlashList の `numColumns` は実行中に変わる。FlashList v2 が追従するかを実装時に確認し、崩れる場合は `key` に列数を含めて作り直す。
- `MEDIA_COLUMNS === 3 ? "w-1/3" : "w-1/2"` のように列数で幅のクラスを選んでいる箇所は、列数から `w-full`、`w-1/2`、…、`w-1/6` を引く対応表を `lib/device-layout.ts` に 1 つ置いて使う。Uniwind は動的に組み立てたクラス名を生成しないので、表には完全なクラス名を書く。
- 設定画面の左右分割（`app/settings/_layout.tsx`、`app/settings/index.tsx`）は、`isIPad && width >= 768` を `isWide` に変える。開いた Duo でも左右分割になる。iPad を分割画面で狭く使っているとき（768pt 未満）はメニュー形式になる。

### 2. 開閉したときのタブとページのずれ (`components/design-system/tabs.tsx`)

原因: ページ幅に `useWindowDimensions()` の幅を使っているが、幅が変わったときにスクロール位置を直していない。下線の位置に使う `scrollX` の初期値も、最初の描画時に 1 回しか計算されない。そのため、選択中のタブ（`activeIndex`）、下線、表示中のページがずれる。

直し方:

1. **ページ幅はページャー自身の幅で決める**: ページャーの `onLayout` で測った幅を使い、測る前は画面幅を使う。セクション 3 の余白や設定画面の左右分割で、画面幅とページャーの幅が違っても正しく動くようにするため。
2. **幅が変わったら選択中のページに合わせ直す**: 幅が変わったら `scrollToOffset({ offset: activeIndex * 新しい幅, animated: false })` を呼び、同じ値を `scrollX.setValue()` に入れる。`activeIndex` を基準に、タブ、下線、ページの 3 つをそろえる。
3. **`getItemLayout` を渡す**: `scrollToIndex` が今のページ幅で計算されるようにする。
4. **均等幅のタブバーは、タブバー自身の幅で位置を計算する**: `screenWidth / tabs.length` をやめて、タブバーの `onLayout` で測った幅を使う。

同じ作りの箇所:

- **プロフィールのタブ**（`profile/tabs.tsx`、`profile/profile-page.tsx`）: `screenWidth / tabs.length` と `width: screenWidth` を、同じ方針で直す。
- **メタデータ編集の写真ページャー**（`metadata-editor/photo-pager.tsx`）: 開閉して確認し、ずれるなら同じ方針で直す。
- **メディアカルーセル**: 外部ライブラリ `@natsuneko-laboratory/react-native-carousel-viewer` を使っている。開閉して崩れる場合は、このリポジトリの外の別タスクにする。

### 3. ステータス表示との重なり

画面上部に固定で表示されるものだけ、`paddingLeft: insets.left` と `paddingRight: insets.right` を入れる。今の left は 0 だが、端末の向きが変わったときのために左右とも入れる。既存のコードと同じく `useSafeAreaInsets()` の値を `style` で渡し、共通部品は新しく作らない。

| 対象 | ファイル |
| --- | --- |
| 共通ヘッダー | `components/navigation/app-header.tsx` |
| 上に表示するタブバー（ホーム、検索ほか） | `components/design-system/tabs.tsx` のタブバー部分 |
| 検索欄 | `app/(drawer)/(tabs)/explore.tsx` の検索欄 |
| プロフィールのナビバー、上に張り付くタブバー、「…」ボタン | `components/profile/overlay.tsx`、`components/profile/profile-page.tsx`（`top: insets.top + 8` に合わせて `right` も） |
| Fleet ビューアの上部の操作ボタン | `components/fleet/viewer.tsx` |
| 上に出るトースト | `components/design-system/toast.tsx` |

タイムラインやグリッドなど、スクロールする中身には余白を入れない。普通の iPhone で中身がステータスバーの下を流れるのと同じ扱いで、iOS もステータス表示の後ろに半透明の背景を敷いている。

畳んだ状態の `insets` はまだ測っていない。実装の最初に測り、right（またはほかの辺）に値が入ることを確かめてから進める。値が入らない場合は、この節の方針を見直す。

### 4. バナーの大きさ

ヘッダー画像は 1500×500（3:1）。

1. **全幅のバナーは高さに上限を付ける**: `headerHeightFor(width, height) = min(width / 3, height * 0.3)` を `lib/device-layout.ts` に置き、`useDeviceLayout().headerHeight` で返す。プロフィールのバナー（`components/profile/header.tsx`）は、今の下限 136pt を残して `max(136, headerHeight)` にする。コンテスト詳細のバナー（`app/contest/[slug].tsx`）は `headerHeight` をそのまま使う。画像は `contentFit="cover"` なので、上限に当たると上下が少し切れる。

   | 画面 (pt) | 今（プロフィール / コンテスト詳細） | 変更後 |
   | --- | --- | --- |
   | iPhone 402×874 | 136 / 134 | 136 / 134（変わらない） |
   | Duo 畳 466×678 | 155 / 155 | 155 / 155（変わらない） |
   | Duo 開 951×669 | 317 / 317 | 201 / 201 |
   | iPad 13" 縦 1032×1376 | 344 / 344 | 344 / 344（変わらない） |
   | iPad 13" 横 1376×1032 | 459 / 459 | 310 / 310 |

2. **コンテスト一覧のカードは縦横比で決める**: `components/contest/card.tsx` の `h-32` を `aspect-[3/1]` に変える（画像がないときの代わりの表示も同じ）。カードの幅はリストの 1 列分。普通の iPhone では幅 378pt で高さ 126pt（今 128pt）、畳んだ Duo では 147pt、開いた Duo では 2 列になり約 150pt。

## テストと確認

### 自動テスト (jest)

`apps/mobile/src/lib/device-layout.test.ts` を追加する。

- `columnsFor`: セクション 1 の表のすべての幅で、投稿、メディア、リストの列数が表どおりになること。
- `headerHeightFor`: セクション 4 の表のすべての画面サイズで、表どおりの高さになること。

タブのページャーの「幅が変わったら合わせ直す」部分は、jest では FlatList のスクロールを再現しにくいので、シミュレータで確認する。

### シミュレータでの確認 (iPhone Duo、開いた状態と畳んだ状態)

1. 畳んだ状態の `insets` を一時的なログで測る（確認後に消す）。
2. ホームの「グローバル」、検索の「コンテスト」、プロフィールの「ギャラリー」を選んだ状態で、開く→畳む→開くと切り替え、選択中のタブ、下線、表示中のページがそろっていること。
3. 開いた状態で、プロフィールの投稿が 4 列、ギャラリーが 3 列、検索のユーザー一覧とコンテスト一覧が 2 列になること。畳むと 3 列、2 列、1 列に戻ること。
4. 共通ヘッダー、上のタブバー、検索欄、プロフィールの「…」ボタンが、ステータス表示と重ならないこと。
5. 開いた状態で、プロフィールとコンテスト詳細のバナーが約 201pt になり、コンテスト一覧のカードが 3:1 で表示されること。
6. 開いた状態で、設定画面が左右分割になること。
7. 普通の iPhone のシミュレータで、ホーム、プロフィール、検索、設定の見た目が変わっていないこと。

### 完了条件

- 上の jest のテストと、既存のテスト（`pnpm test`）が通る。
- `pnpm typecheck` と `pnpm lint` が通る。
- シミュレータでの確認項目をすべて満たす。

## 進める順番

1. `lib/device-layout.ts` の計算関数とフック、そのテスト
2. 列数を使っている 13 ファイルの置き換えと、設定画面の左右分割（設計 1）
3. タブのページャーとプロフィールのタブ（設計 2）
4. 上部のヘッダー類の左右の余白（設計 3）
5. バナーの大きさ（設計 4）
6. シミュレータでの確認

## ビルドについて

Xcode 27.2 では、`expo-modules-core@58.0.23` のコンパイル中に Swift コンパイラがクラッシュして、ネイティブのビルドが通らない。回避するパッチはブランチ `claude/amazing-cohen-7de1bb` にある。今回の変更は JS だけなので、2026-10-29 にビルドされた .app と Metro で確認できる。そのブランチをこの作業に取り込むかどうかは別に決める。

## 今回やらないこと

- 開いた状態での、サイドバーでの画面移動や、一覧と詳細を左右に並べる表示
- タイムラインの中身を、中央の決まった幅に収めるレイアウト
- タイムラインの画像カルーセルの高さ（画面の高さの半分が上限）の変更
- 外部ライブラリ（カルーセル、全画面の画像ビューア）の開閉や重なりへの対応。不具合が見つかったら別タスクにする
- AGENTS.md の「自動テストはない」という記述の修正
