import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const CopyIcon = () => (
  <svg {...base}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const DownloadIcon = () => (
  <svg {...base}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 20h16" />
  </svg>
);

export const CheckIcon = () => (
  <svg {...base}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const MaximizeIcon = () => (
  <svg {...base}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const MinimizeIcon = () => (
  <svg {...base}>
    <path d="M5 3v3a2 2 0 0 1-2 2H0" transform="translate(2 0)" />
    <path d="M9 3v3a2 2 0 0 0 2 2h3" />
    <path d="M9 21v-3a2 2 0 0 1 2-2h3" />
    <path d="M3 15h3a2 2 0 0 1 2 2v3" />
  </svg>
);

export const ChevronLeftIcon = () => (
  <svg {...base}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const ChevronRightIcon = () => (
  <svg {...base}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const StarIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"}>
    <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0l-4.725 2.885a.562.562 0 0 1-.84-.61l1.285-5.385a.563.563 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345l2.125-5.111Z" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
);

export const SunIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const MoonIcon = () => (
  <svg {...base}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  </svg>
);

export const ImageDownloadIcon = () => (
  <svg {...base}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

/* ---- Graph box controls (smaller, 14px) ---- */
const small: SVGProps<SVGSVGElement> = { ...base, width: 14, height: 14 };

/** Expand just this box (show its fields). */
export const BoxExpandIcon = () => (
  <svg {...small}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** Collapse just this box (header only). */
export const BoxCollapseIcon = () => (
  <svg {...small}>
    <path d="m6 15 6-6 6 6" />
  </svg>
);

/** Expand every child box beneath this one. */
export const TreeExpandIcon = () => (
  <svg {...small}>
    <path d="m7 5 5 5 5-5" />
    <path d="m7 13 5 5 5-5" />
  </svg>
);

/** Collapse every child box beneath this one (they stay visible, collapsed). */
export const TreeCollapseIcon = () => (
  <svg {...small}>
    <path d="m7 11 5-5 5 5" />
    <path d="m7 19 5-5 5 5" />
  </svg>
);

/** Show this box's child boxes. */
export const EyeIcon = () => (
  <svg {...small}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** Hide this box's child boxes from the diagram. */
export const EyeOffIcon = () => (
  <svg {...small}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    <path d="m3 3 18 18" />
  </svg>
);
