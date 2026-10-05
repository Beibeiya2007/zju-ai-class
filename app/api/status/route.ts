import { aiStatus, env } from "@/lib/ai-server";
export async function GET() {
  return Response.json(
    {
      ...aiStatus(),
      protected: !!env("LECTURE_ACCESS_TOKEN"),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
