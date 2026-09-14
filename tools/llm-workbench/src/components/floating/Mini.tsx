export function Mini({
  label,
  value,
  accent,
  bg = 'bg-sunken',
}: {
  label: string;
  value: string;
  accent?: boolean;
  bg?: string;
}) {
  return (
    <div className={'rounded-md py-1 ' + bg}>
      <div className={'text-[12px] font-semibold ' + (accent ? 'text-accent' : 'text-ink')}>
        {value}
      </div>
      <div className="text-[9px] text-muted">{label}</div>
    </div>
  );
}
