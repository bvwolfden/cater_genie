"use client";

import { UserButton } from "@clerk/nextjs";

// Renders nothing unless Clerk is configured (publishable key inlined at build).
// When auth is on, the middleware guarantees the viewer is signed in, so we just
// show the account/avatar menu.
export function AuthButton() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  return (
    <div className="flex items-center">
      <UserButton />
    </div>
  );
}
