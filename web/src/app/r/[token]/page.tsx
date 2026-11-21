import type { Metadata } from "next";
import { reviewData } from "@/server/public";
import { GuestFailure } from "@/app/guest-parts";
import { ReviewClient } from "./ReviewClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review a project | IZWI AI", robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: ReturnType<typeof reviewData>;
  try {
    data = reviewData(token);
  } catch (e) {
    return <GuestFailure error={e} what="review" />;
  }
  return <ReviewClient token={token} data={JSON.parse(JSON.stringify(data))} />;
}
