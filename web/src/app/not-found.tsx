// Shown for any route or record that does not exist (including stories the viewer cannot open).
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

export default function NotFound() {
  return (
    <main className="z-404">
      <Wordmark href="/" size={28} />
      <div className="z-404-body">
        <p className="z-404-code">404</p>
        <h1>Page not found</h1>
        <div className="z-404-actions">
          <Link href="/app" className="z-btn z-btn-primary">Open stories</Link>
          <Link href="/" className="z-btn z-btn-ghost">Home</Link>
        </div>
      </div>
    </main>
  );
}
