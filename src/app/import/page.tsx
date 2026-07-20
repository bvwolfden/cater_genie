import { Nav } from "@/components/Nav";
import { Header } from "@/components/Header";
import { ImportDropzone } from "@/components/ImportDropzone";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <Nav />
      <Header />
      <p className="mb-4 text-sm text-ink-2">
        Drop any source-system export — AI reads it, you review the parsed rows, then commit. No re-typing, no
        transcription mistakes.
      </p>
      <div className="mx-auto max-w-3xl">
        <ImportDropzone />
      </div>
    </main>
  );
}
