import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Auth is OFF unless Clerk keys are present, so the app keeps running without
// them. Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY to turn it on.
const CLERK_ENABLED = Boolean(process.env.CLERK_SECRET_KEY);

const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/qbo/callback(.*)", // Intuit redirects here without a Clerk session
]);

export default CLERK_ENABLED
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublic(req)) await auth.protect();
    })
  : function passThrough() {
      // Clerk disabled — let every request through.
    };

export const config = {
  matcher: [
    // Skip Next internals and static files; run on app routes + API.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
