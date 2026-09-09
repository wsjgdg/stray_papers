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
        'block w-full px-3 py-1 text-left hover:bg-[#16223a] ' +
        (danger ? 'text-[#ef6b6b]' : 'text-ink')
      }
      onClick={onClick}
    >
      {label}
    </button>
  );
}
