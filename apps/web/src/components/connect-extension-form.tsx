"use client";

import { useState } from "react";
import { connectExtensionAction } from "@/app/actions";
import { SubmitButton } from "./submit-button";

/**
 * Connect and Cancel on /extension/connect. The page itself goes to the address
 * the action returns: a redirect answering the form's submission would be
 * stopped by the Content Security Policy's form-action, which allows only this site.
 */
export function ConnectExtensionForm({
  redirectUri,
  state,
  cancelUrl,
  labels,
}: {
  redirectUri: string;
  state: string;
  cancelUrl: string;
  labels: { connect: string; connecting: string; cancel: string; failed: string };
}) {
  const [failed, setFailed] = useState(false);
  async function connect(formData: FormData) {
    const location = await connectExtensionAction(formData);
    if (location) window.location.replace(location);
    else setFailed(true);
  }
  return (
    <form action={connect}>
      <input type="hidden" name="redirect_uri" value={redirectUri} />
      <input type="hidden" name="state" value={state} />
      <SubmitButton className="button primary" pendingText={labels.connecting}>
        {labels.connect}
      </SubmitButton>
      <a href={cancelUrl} className="button">
        {labels.cancel}
      </a>
      {failed && <p className="status error">{labels.failed}</p>}
    </form>
  );
}
