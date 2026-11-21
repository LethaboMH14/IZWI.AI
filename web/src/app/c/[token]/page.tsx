import type { Metadata } from "next";
import { consentData } from "@/server/public";
import { GuestFailure } from "@/app/guest-parts";
import { ConsentClient } from "./ConsentClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "A request for your permission | IZWI AI", robots: { index: false, follow: false } };

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: ReturnType<typeof consentData>;
  try {
    data = consentData(token);
  } catch (e) {
    return <GuestFailure error={e} what="consent" />;
  }
  return <ConsentClient token={token} data={JSON.parse(JSON.stringify(data))} />;
}
