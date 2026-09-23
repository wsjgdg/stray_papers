import type { ReactNode } from "react"

type SettingsSectionProps = {
  eyebrow: string
  title: string
  description?: string
  children: ReactNode
}

export function SettingsSection({
  eyebrow,
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-1 font-display text-xl font-bold">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  )
}
