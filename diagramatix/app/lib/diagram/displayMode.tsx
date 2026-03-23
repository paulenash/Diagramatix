"use client";

import { createContext } from "react";

export type DisplayMode = "normal" | "hand-drawn";

export const DisplayModeCtx = createContext<DisplayMode>("normal");

/** Font scale contexts — ratio of user font size to defaults */
export const FontScaleCtx = createContext<number>(1);           // elements (base 12px)
export const ConnectorFontScaleCtx = createContext<number>(1);  // connectors (base 10px)
export const TitleFontSizeCtx = createContext<number>(14);      // title absolute px

/** SVG filter component — render inside <svg> to define the sketchy filter */
export function SketchyFilter() {
  return (
    <defs>
      <filter id="sketchy" x={"-5%"} y={"-5%"} width={"110%"} height={"110%"}>
        <feTurbulence
          type="turbulence"
          baseFrequency="0.015"
          numOctaves={3}
          result="noise"
          seed={2}
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale={1.5}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  );
}

/** Returns the filter URL string when in hand-drawn mode, undefined otherwise */
export function sketchyFilter(mode: DisplayMode): string | undefined {
  return mode === "hand-drawn" ? "url(#sketchy)" : undefined;
}
