// 路由级加载骨架：客户端切换页面时立刻有东西看，不再白屏。
// 与 BootSplash 同一套视觉语言（min-h 撑满，避免布局跳动）。
export default function Loading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-lg animate-pulse">
          🧭
        </div>
        <div className="space-y-2">
          <div className="skeleton h-3.5 w-40 rounded" />
          <div className="skeleton h-2.5 w-24 rounded" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3"
          >
            <div className="skeleton h-32 w-full rounded-xl" />
            <div className="skeleton h-3 w-2/3 rounded" />
            <div className="skeleton h-2.5 w-1/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
