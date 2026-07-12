"use client";

import Image from "next/image";
import { resolveMediaUrl } from "@/lib/mediaUrl";

function needsUnoptimized(src: string): boolean {
  if (src.startsWith("blob:") || src.startsWith("data:")) return true;
  if (src.startsWith("/media/")) return true;

  try {
    return new URL(src).pathname.startsWith("/media/");
  } catch {
    return false;
  }
}

function getFullImageUrl(src: string): string {
  if (!src) return src;
  const resolved = resolveMediaUrl(src);
  return resolved ?? src;
}

type AppImageFillProps = {
  src: string;
  alt: string;
  fill: true;
  className?: string;
  sizes: string;
  priority?: boolean;
};

type AppImageFixedProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
};

export type AppImageProps = AppImageFillProps | AppImageFixedProps;

function isFillProps(props: AppImageProps): props is AppImageFillProps {
  return "fill" in props && props.fill === true;
}

/** API / blob / data URL görselleri için ortak `next/image` sarmalayıcısı. */
export function AppImage(props: AppImageProps) {
  const resolvedSrc = getFullImageUrl(props.src);
  const unopt = needsUnoptimized(resolvedSrc);
  if (isFillProps(props)) {
    const { alt, className, sizes, priority } = props;
    return (
      <Image
        src={resolvedSrc}
        alt={alt}
        fill
        sizes={sizes}
        className={className}
        unoptimized={unopt}
        loading={priority ? undefined : "lazy"}
        priority={priority}
      />
    );
  }
  const { alt, width, height, className, priority } = props;
  return (
    <Image
      src={resolvedSrc}
      alt={alt}
      width={width}
      height={height}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      className={className}
      unoptimized={unopt}
      loading={priority ? undefined : "lazy"}
      priority={priority}
    />
  );
}
