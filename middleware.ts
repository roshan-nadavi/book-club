import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function middleware(request: NextRequest) {
  // This is the essential part that keeps the Supabase session active
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - Any file with a common image extension
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};