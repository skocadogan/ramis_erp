export default function RootLoading() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 border-r border-border bg-sidebar p-4 md:block">
        <div className="mb-6 h-8 w-32 rounded-md bg-sidebar-accent" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-4 rounded bg-sidebar-accent" />
              <div className="h-4 flex-1 rounded bg-sidebar-accent" />
            </div>
          ))}
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-ui-sm text-muted-foreground">Yükleniyor...</p>
        </div>
      </main>
    </div>
  );
}
