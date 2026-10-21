"use client";

import { useActionState } from "react";
import { createTokenAction, type CreateTokenState } from "@/app/actions";
import { CopyButton } from "./copy-button";

export function TokenForm() {
  const [state, action, pending] = useActionState<CreateTokenState, FormData>(createTokenAction, {});
  return (
    <div>
      <form action={action} className="add-url">
        <label htmlFor="token-name" className="visually-hidden">
          Token name
        </label>
        <input id="token-name" name="name" type="text" placeholder="Name, e.g. Chrome on my laptop" maxLength={100} />
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Creating…" : "Create token"}
        </button>
      </form>
      {state.error && <p className="status error">{state.error}</p>}
      {state.token && (
        <div className="notice success">
          <p>
            <strong>New token for “{state.name}”.</strong> Copy it now: it won’t be shown again.
          </p>
          <div className="secret">{state.token}</div>
          <p style={{ marginBottom: 0 }}>
            <CopyButton text={state.token} label="Copy token" />
          </p>
        </div>
      )}
    </div>
  );
}
