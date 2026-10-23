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
