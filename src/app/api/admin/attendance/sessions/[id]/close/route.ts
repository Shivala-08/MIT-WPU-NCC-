import { handleSessionAction } from "@/lib/attendance-session-action";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return handleSessionAction(req, { id }, "close");
}
