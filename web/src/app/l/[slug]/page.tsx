import type { Metadata } from "next";
import { listingData } from "@/server/public";
import { GuestFailure } from "@/app/guest-parts";
import { ListingClient } from "./ListingClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const d = listingData(slug);
    return { title: `${d.title} | Licence this clip | IZWI AI`, description: `A clip by ${d.by}. Ask to license it.` };
  } catch {
    return { title: "Clip not found | IZWI AI", robots: { index: false } };
  }
}

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let data: ReturnType<typeof listingData>;
  try {
    data = listingData(slug);
  } catch (e) {
    return <GuestFailure error={e} what="listing" />;
  }
  return <ListingClient slug={slug} data={JSON.parse(JSON.stringify(data))} />;
}
