import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <div className="grid min-h-screen place-items-center p-6 text-ink-2">Authentication is not configured.</div>;
  }
  return (
    <div className="grid min-h-screen place-items-center bg-canvas-900 p-6">
      <SignUp />
    </div>
  );
}
