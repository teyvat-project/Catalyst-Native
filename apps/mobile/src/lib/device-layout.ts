import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

/** 1 マスの目標幅から列数を求める。iPad かどうかではなく幅で決めるので、iPhone Duo の開閉にも追従する */
export const columnsFor = (width: number, target: number, min: number) => Math.max(min, Math.floor(width / target));

/** ヘッダー画像 (1500:500 = 3:1) の高さ。横長の画面で画面を占めすぎないよう、画面の高さの 30% までにする */
export const headerHeightFor = (width: number, height: number) => Math.min(width / 3, height * 0.3);

// Uniwind は組み立てたクラス名を生成しないので、完全なクラス名を並べておく
const WIDTH_CLASSES = ["w-full", "w-1/2", "w-1/3", "w-1/4", "w-1/5", "w-1/6"];

/** 列数に対応する幅のクラス。表にない 7 列以上は w-1/6 にする */
export const widthClassFor = (columns: number) => WIDTH_CLASSES[Math.min(columns, WIDTH_CLASSES.length) - 1]!;

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
