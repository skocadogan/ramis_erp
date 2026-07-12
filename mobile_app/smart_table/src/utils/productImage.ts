import { useCallback, useMemo, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import type { ImageContentFit, ImageLoadEventData } from "expo-image";

export const FOOD_IMAGE_ASPECT_RATIO = 4 / 3;
/** Varsayılan: dik görseller için güvenli sığdırma */
export const PRODUCT_IMAGE_CONTENT_FIT = "contain" as const;

function resolveProductImageContentFit(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
): ImageContentFit {
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return PRODUCT_IMAGE_CONTENT_FIT;
  }

  const imageAspect = imageWidth / imageHeight;
  const containerAspect = containerWidth / containerHeight;

  return imageAspect >= containerAspect ? "cover" : "contain";
}

export function useAdaptiveProductImageFit(imageUrl?: string) {
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const [prevProductImageUrl, setPrevProductImageUrl] = useState(imageUrl);
  if (imageUrl !== prevProductImageUrl) {
    setPrevProductImageUrl(imageUrl);
    setImageSize(null);
  }

  const contentFit = useMemo(
    () =>
      containerSize && imageSize
        ? resolveProductImageContentFit(
            imageSize.width,
            imageSize.height,
            containerSize.width,
            containerSize.height,
          )
        : PRODUCT_IMAGE_CONTENT_FIT,
    [containerSize, imageSize],
  );

  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ width, height });
    }
  }, []);

  const handleImageLoad = useCallback((event: ImageLoadEventData) => {
    const { width, height } = event.source;
    if (width > 0 && height > 0) {
      setImageSize({ width, height });
    }
  }, []);

  return { contentFit, handleContainerLayout, handleImageLoad };
}
