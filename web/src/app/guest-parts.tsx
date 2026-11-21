// Shared frame and states for the guest pages (review, consent, listing). Works in server and client components.
import type { ReactNode } from "react";
import { HttpError } from "@/server/http";
import { Mark } from "@/components/Mark";
import "@/app/guest.css";

export function GuestFrame({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="gx">
      <main className="gx-wrap">
        <div className="gx-top">
          <Mark small />
          {note && <small>{note}</small>}
        </div>
        {children}
      </main>
    </div>
  );
}

export function GuestState({ title, body }: { title: string; body: string }) {
  return (
    <div className="gx">
      <div className="gx-state">
        <div>
          <Mark small />
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
      </div>
    </div>
  );
}

/** Turn whatever a server function threw into a calm full-page state. No technical text reaches the person. */
export function GuestFailure({ error, what }: { error: unknown; what: "review" | "consent" | "listing" }) {
  if (error instanceof HttpError && error.status === 410) {
    return <GuestState title="This link has stopped working" body={error.message} />;
  }
  if (error instanceof HttpError && error.status === 404) {
    return (
      <GuestState
        title={what === "listing" ? "This clip is not listed" : "We could not find this link"}
        body={what === "listing" ? "The creator may have switched it off. If you were sent this link, ask them for a new one." : "Check that you copied the whole link. If it still fails, ask the creator to send it again."}
      />
    );
  }
  return <GuestState title="Something went wrong on our side" body="Please try again in a minute. Nothing you did caused this." />;
}
