import { useId } from "react";
import "./Brand.css";

/** The approved empty raccoon contour and four-point metallic star. */
export function NenoMark({
  className = "",
  monochrome = false,
}: {
  className?: string;
  monochrome?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const star =
    "M52 3 C55 14 55 16 66 19 C55 22 55 24 52 35 C49 24 49 22 38 19 C49 16 49 14 52 3Z";
  return (
    <svg
      className={className}
      viewBox="0 0 104 94"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={id + "-color"}
          x1="40"
          y1="7"
          x2="63"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4786ef" />
          <stop offset=".25" stopColor="#66d5f3" />
          <stop offset=".48" stopColor="#bda9f7" />
          <stop offset=".69" stopColor="#ee98cf" />
          <stop offset=".88" stopColor="#ffcf78" />
          <stop offset="1" stopColor="#ffe6a9" />
        </linearGradient>
        <radialGradient id={id + "-light"} cx=".48" cy=".37" r=".65">
          <stop stopColor="white" stopOpacity=".88" />
          <stop offset=".48" stopColor="white" stopOpacity=".12" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M34 26C26 20 20 18 15 23C10 28 13 36 16 40C11 46 11 52 6 57C8 61 11 61 13 66C19 81 34 87 52 87C70 87 85 81 91 66C93 61 96 61 98 57C93 52 93 46 88 40C91 36 94 28 89 23C84 18 78 20 70 26"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {!monochrome && (
        <path d={star} transform="translate(0 1.1)" fill="#6582bf" />
      )}
      <path
        d={star}
        fill={monochrome ? "currentColor" : "url(#" + id + "-color)"}
        stroke={monochrome ? "none" : "#9ec7f2"}
        strokeWidth=".7"
      />
      {!monochrome && (
        <>
          <path d={star} fill={"url(#" + id + "-light)"} />
          <path
            d="M51.8 5.7C54.3 15 54.4 16.7 63.5 19"
            stroke="white"
            strokeOpacity=".88"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

export function NenoBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={"nl-brand" + (compact ? " nl-brand--compact" : "")}>
      <NenoMark />
      <span className="nl-brand-words">
        <strong>
          小能<span>AI</span>
        </strong>
        <span>NenoAI</span>
      </span>
    </span>
  );
}
