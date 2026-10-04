import { env } from "@/lib/ai-server";
export async function GET() {
  return Response.json(
    {
      configured: !!env("OPENAI_API_KEY"),
      protected: !!env("LECTURE_ACCESS_TOKEN"),
      provider: "OpenAI",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
