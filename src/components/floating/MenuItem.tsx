export function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={
        'block w-full px-3 py-1 text-left hover:bg-hover ' + (danger ? 'text-up' : 'text-ink')
      }
      onClick={onClick}
    >
      {label}
    </button>
  );
}
