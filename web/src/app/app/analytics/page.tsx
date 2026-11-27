// Analytics needs platform connections that are limited by access (CRITERIA C4, X9), so this page says so
// plainly instead of drawing charts from numbers that don't exist.
import { ChartBar } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export default function AnalyticsPage() {
  return (
    <div className="z-empty-page">
      <div className="z-empty-card">
        <ChartBar size={28} aria-hidden="true" />
        <h1>Analytics</h1>
        <p>No platform is connected, so there is no reach or retention to show. Connections to YouTube, TikTok and Instagram are limited by access until their apps are approved.</p>
        <Link href="/app" className="z-btn z-btn-secondary z-btn-md" style={{ textDecoration: "none" }}>Back to stories</Link>
      </div>
    </div>
  );
}
