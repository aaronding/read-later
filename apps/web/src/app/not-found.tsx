import Link from "next/link";

export default function NotFound() {
  return (
    <main className="centered">
      <div className="card sign-in">
        <h1>Not found</h1>
        <p className="muted">This page or article doesn’t exist, or it was deleted.</p>
        <Link className="button primary" href="/inbox">
          Go to the Inbox
        </Link>
      </div>
    </main>
  );
}
