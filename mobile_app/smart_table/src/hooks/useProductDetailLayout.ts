// Ürün detay ekranı — tablet / yatay mod responsive ölçüler

import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { FOOD_IMAGE_ASPECT_RATIO } from "@/utils/productImage";

const CONTENT_MAX_WIDTH = 720;
const HERO_COLUMN_WIDTH = 550;
const HERO_COLUMN_WIDTH_RATIO = 0.48;

/** Yatay (split) düzen — sol sütundaki kompakt ürün görseli */
const HERO_IMAGE_MAX_WIDTH_SPLIT = 480;
const HERO_IMAGE_MAX_HEIGHT_SPLIT = 360;

/** Dikey (tek sütun) düzen — üstteki ürün görseli */
const HERO_IMAGE_MAX_WIDTH_PORTRAIT = 450;
const HERO_IMAGE_MAX_HEIGHT_PORTRAIT = 300;

function computeHeroImageSize(
  innerWidth: number,
  maxWidth: number,
  maxHeight: number,
): { heroImageWidth: number; heroImageHeight: number } {
  let heroImageWidth = Math.min(innerWidth, maxWidth);
  let heroImageHeight = Math.round(heroImageWidth / FOOD_IMAGE_ASPECT_RATIO);

  if (heroImageHeight > maxHeight) {
    heroImageHeight = maxHeight;
    heroImageWidth = Math.round(heroImageHeight * FOOD_IMAGE_ASPECT_RATIO);
  }

  return { heroImageWidth, heroImageHeight };
}

export function useProductDetailLayout() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isLandscape = width > height;
    const isWide = width >= 720;
    const useSplitLayout = isLandscape && isWide;

    const heroColumnWidth = useSplitLayout
      ? Math.min(HERO_COLUMN_WIDTH, Math.round(width * HERO_COLUMN_WIDTH_RATIO))
      : width;

    const contentMaxWidth = Math.min(CONTENT_MAX_WIDTH, width - 32);
    const horizontalPadding = isWide ? 24 : 20;
    const sectionGap = isWide ? 16 : 20;

    const heroInnerWidth = useSplitLayout
      ? heroColumnWidth - horizontalPadding * 2
      : Math.min(contentMaxWidth, width - horizontalPadding * 2);

    const heroImageSize = useSplitLayout
      ? computeHeroImageSize(
          heroInnerWidth,
          HERO_IMAGE_MAX_WIDTH_SPLIT,
          HERO_IMAGE_MAX_HEIGHT_SPLIT,
        )
      : computeHeroImageSize(
          heroInnerWidth,
          HERO_IMAGE_MAX_WIDTH_PORTRAIT,
          HERO_IMAGE_MAX_HEIGHT_PORTRAIT,
        );

    return {
      isLandscape,
      isWide,
      useSplitLayout,
      heroColumnWidth,
      contentMaxWidth,
      horizontalPadding,
      sectionGap,
      ...heroImageSize,
    };
  }, [width, height]);
}
