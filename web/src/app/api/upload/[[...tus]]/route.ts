import { tus } from "@/server/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = (req: Request) => tus.handleWeb(req);
export { handler as GET, handler as POST, handler as PATCH, handler as HEAD, handler as DELETE, handler as OPTIONS };
