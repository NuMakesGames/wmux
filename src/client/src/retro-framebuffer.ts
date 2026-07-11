import { type CSSProperties, type RefObject, useLayoutEffect } from "react";
import { RETRO_BOOT_ARTWORK } from "./RetroBootArtwork";

const MAX_FRAMEBUFFER_WIDTH = 920;
const MAX_FRAMEBUFFER_HEIGHT = 680;

export function fitRetroFramebuffer(
  framebuffer: readonly [width: number, height: number],
  availableWidth: number,
  availableHeight: number,
) {
  const ratio = framebuffer[0] / framebuffer[1];
  const width = Math.min(MAX_FRAMEBUFFER_WIDTH, availableWidth, availableHeight * ratio);
  return { width, height: width / ratio };
}

export function retroFramebufferStyle(profileId: string): CSSProperties {
  const artwork = RETRO_BOOT_ARTWORK[profileId];
  if (!artwork) return {};
  const [width, height] = artwork.framebuffer;
  return {
    "--retro-framebuffer-aspect": `${width} / ${height}`,
  } as CSSProperties;
}

export function useRetroFramebuffer(containerRef: RefObject<HTMLElement | null>, profileId: string) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    const artwork = RETRO_BOOT_ARTWORK[profileId];
    if (!container || !artwork) return;

    const update = () => {
      const computed = window.getComputedStyle(container);
      const horizontalPadding = Number.parseFloat(computed.paddingLeft) + Number.parseFloat(computed.paddingRight);
      const verticalPadding = Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom);
      const size = fitRetroFramebuffer(
        artwork.framebuffer,
        Math.max(0, container.clientWidth - horizontalPadding),
        Math.max(0, container.clientHeight - verticalPadding),
      );
      container.style.setProperty("--retro-framebuffer-width", `${size.width}px`);
      container.style.setProperty("--retro-framebuffer-height", `${size.height}px`);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [containerRef, profileId]);
}
