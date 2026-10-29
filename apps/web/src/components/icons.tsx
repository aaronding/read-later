// Line icons for the reader's buttons. They take the text color, and the
// button's label (shown, or read out on phones) names the action.

function Icon({ children, size = 20, fill = "none" }: { children: React.ReactNode; size?: number; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </Icon>
  );
}

export function InboxIcon() {
  return (
    <Icon>
      <path d="M4 13h4l1.5 3h5l1.5-3h4" />
      <path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
    </Icon>
  );
}

export function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <Icon fill={filled ? "currentColor" : "none"}>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" />
    </Icon>
  );
}

/** The unread dot that the lists show, in a ring. */
export function UnreadIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function FolderIcon() {
  return (
    <Icon>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </Icon>
  );
}

export function BackIcon() {
  return (
    <Icon size={22}>
      <path d="M15 18l-6-6 6-6" strokeWidth="2" />
    </Icon>
  );
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M6 6l12 12" strokeWidth="2" />
      <path d="M18 6L6 18" strokeWidth="2" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="2.25" />
    </Icon>
  );
}

export function GlobeIcon() {
  return (
    <Icon size={18}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.75 5.6 3.75 9s-1.25 6.4-3.75 9c-2.5-2.6-3.75-5.6-3.75-9S9.5 5.6 12 3z" />
    </Icon>
  );
}

export function SystemThemeIcon() {
  return (
    <Icon size={18}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </Icon>
  );
}

export function SunIcon() {
  return (
    <Icon size={18}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon() {
  return (
    <Icon size={18}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Icon>
  );
}

export function ChevronIcon() {
  return (
    <Icon size={14}>
      <path d="M6 9l6 6 6-6" strokeWidth="2" />
    </Icon>
  );
}

/** Keep offline: an arrow into a tray, or a check once the article is kept. */
export function KeepIcon({ kept = false }: { kept?: boolean }) {
  return (
    <Icon size={16}>
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      {kept ? <path d="M7.5 10.5l3 3 6-6.5" strokeWidth="2" /> : <path d="M12 4v10M7.5 9.5L12 14l4.5-4.5" />}
    </Icon>
  );
}
