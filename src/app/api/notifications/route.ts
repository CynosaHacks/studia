import { handle } from "@/lib/api";
import { computeNotifications } from "@/lib/notifications";

export async function GET() {
  return handle(() => ({ notifications: computeNotifications() }));
}
