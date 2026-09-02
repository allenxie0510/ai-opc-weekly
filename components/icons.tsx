import type { ReactNode, SVGProps } from 'react';

export type LineIconName =
  | 'archive'
  | 'check'
  | 'check-square'
  | 'clipboard'
  | 'circle-dot'
  | 'clock'
  | 'compass'
  | 'external-link'
  | 'file-text'
  | 'flag'
  | 'folder'
  | 'palette'
  | 'pen'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'rocket'
  | 'save'
  | 'search'
  | 'settings'
  | 'sparkles'
  | 'star'
  | 'trash'
  | 'trending-down'
  | 'trending-up'
  | 'warning'
  | 'wrench'
  | 'x'
  | 'zap';

type LineIconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  name: LineIconName;
};

/** Lightweight, dependency-free UI icons. All marks inherit the surrounding text color. */
export function LineIcon({ name, className = '', ...props }: LineIconProps) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const paths: Record<LineIconName, ReactNode> = {
    archive: <><path d="M4 7h16v12H4z" /><path d="M3 4h18v3H3zM9 11h6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    'check-square': <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m7 12 3 3 7-7" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M9 9h6M9 13h6M9 17h4" /></>,
    'circle-dot': <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
    'external-link': <><path d="M14 5h5v5M19 5l-9 9" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    'file-text': <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 12h6M9 16h6" /></>,
    flag: <><path d="M5 21V4" /><path d="M5 5h11l-2 4 2 4H5" /></>,
    folder: <path d="M3 6h7l2 2h9v11H3z" />,
    palette: <><path d="M12 3a9 9 0 0 0 0 18h1.3a2 2 0 0 0 1.7-3c-.7-1.2.2-2.7 1.6-2.7H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z" /><circle cx="7.5" cy="10" r=".7" fill="currentColor" stroke="none" /><circle cx="10" cy="6.8" r=".7" fill="currentColor" stroke="none" /><circle cx="14" cy="6.8" r=".7" fill="currentColor" stroke="none" /><circle cx="16.5" cy="10" r=".7" fill="currentColor" stroke="none" /></>,
    pen: <><path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8z" /><path d="m13.8 7 3.2 3.2M4 20l1-4.2" /></>,
    play: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
    rocket: <><path d="M14 5c2.8-2.8 5-2 5-2s.8 2.2-2 5l-5 5-4-4z" /><path d="m8 9-3 1-2 2 5 1M12 13l-1 5 2-2 1-3" /><circle cx="15" cy="7" r="1" /></>,
    save: <><path d="M4 4h13l3 3v13H4z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>,
    sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7zM5.5 14l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z" /></>,
    star: <path d="m12 3 2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.8-5.4 2.8 1.1-6-4.4-4.2 6-.9z" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
    'trending-down': <><path d="m4 7 6 6 4-4 6 6" /><path d="M15 15h5v-5" /></>,
    'trending-up': <><path d="m4 17 6-6 4 4 6-6" /><path d="M15 9h5v5" /></>,
    warning: <><path d="M12 3 2.8 20h18.4z" /><path d="M12 9v5M12 17.5h.01" /></>,
    wrench: <path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.8 2.8-3-3z" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  };

  return (
    <svg
      aria-hidden="true"
      className={`ui-line-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      focusable="false"
      {...common}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
