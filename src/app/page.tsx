import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth";

export default async function RootPage() {
  const session = await auth();

  if (!session) return redirect("/login");

  if (isAdmin(session.user.role)) {
    return redirect("/admin/home");
  }

  return redirect("/portal/home");
}
