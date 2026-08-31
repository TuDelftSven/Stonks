import { authError, requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json({ user });
  } catch (error) {
    return authError(error);
  }
}
