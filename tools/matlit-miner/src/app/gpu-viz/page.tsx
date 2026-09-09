import { GpuEfficiencyScatter } from "@/components/gpu-efficiency-scatter";

export default function GpuVizPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">GPU Efficiency Field · vgpu / WebGPU</h1>
        <p className="text-sm text-muted-foreground">
          Real mining data from{" "}
          <code className="rounded bg-muted px-1">/api/efficiency</code> rendered
          as a GPU density field: x = year, y = efficiency, color = efficiency
          hue, certified points glow white-hot.
        </p>
      </header>
      <div className="relative flex-1">
        <GpuEfficiencyScatter />
      </div>
    </main>
  );
}
