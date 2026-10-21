"use client";

import { useFormStatus } from "react-dom";

/** A submit button that asks first. */
export function ConfirmButton({ message, children, className = "button" }: { message: string; children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
