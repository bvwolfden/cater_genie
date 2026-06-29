import { getLaborDetail } from "@/lib/dashboard";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { DeptFilter } from "@/components/DeptFilter";
import { DepartmentTable, EmployeeTable, LaborTotals } from "@/components/LaborTables";
import { LaborDeptChart } from "@/components/charts";
import { Card, SectionHeader } from "@/components/primitives";

export const dynamic = "force-dynamic";

export default async function LaborPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const { dept } = await searchParams;
  const detail = await getLaborDetail(dept);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <Nav />
      <Header />

      <div className="mb-4">
        <LaborTotals detail={detail} />
      </div>

      <div className="mb-4">
        <DeptFilter departments={detail.departments.map((d) => d.department)} active={dept ?? "all"} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <EmployeeTable detail={detail} />
        </div>
        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeader title="Cost by Department" subtitle="Paid labor" />
            <LaborDeptChart data={detail.byDepartment.map((d) => ({ department: d.department, cost: d.cost, hours: d.hours }))} />
          </Card>
          <DepartmentTable detail={detail} />
        </div>
      </div>
    </main>
  );
}
