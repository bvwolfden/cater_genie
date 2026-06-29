import { getEntryContext } from "@/lib/entry";
import { Nav } from "@/components/Nav";
import { Header } from "@/components/Header";
import { DailyEntryWizard } from "@/components/DailyEntryWizard";

export const dynamic = "force-dynamic";

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const ctx = await getEntryContext(date);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <Nav />
      <Header />
      <p className="mb-4 text-sm text-ink-2">
        Quick daily check-in — enter the numbers for the day (replacing the spreadsheet). Sources without a live connection
        are filled here; everything flows straight into the dashboard.
      </p>
      <DailyEntryWizard ctx={ctx} />
    </main>
  );
}
