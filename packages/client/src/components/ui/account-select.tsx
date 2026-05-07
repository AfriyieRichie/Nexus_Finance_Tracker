import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AccountOption {
  id: string;
  code: string;
  name: string;
  class?: string;
  isActive?: boolean;
}

interface AccountSelectProps {
  value: string;
  onChange: (accountId: string) => void;
  accounts: AccountOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const CLASS_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export function AccountSelect({
  value,
  onChange,
  accounts,
  placeholder = 'Select account…',
  disabled,
  className,
}: AccountSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = accounts.find((a) => a.id === value);
  const displayLabel = selected ? `${selected.code} — ${selected.name}` : '';

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts.filter((a) => a.isActive !== false);
    const q = query.toLowerCase();
    return accounts.filter(
      (a) =>
        a.isActive !== false &&
        (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)),
    );
  }, [accounts, query]);

  const hasMultipleClasses = useMemo(() => {
    const classes = new Set(filtered.map((a) => a.class).filter(Boolean));
    return classes.size > 1;
  }, [filtered]);

  const groups = useMemo(() => {
    if (!hasMultipleClasses) {
      return [{ cls: null, items: filtered }];
    }
    return CLASS_ORDER.map((cls) => ({
      cls,
      items: filtered.filter((a) => a.class === cls),
    })).filter((g) => g.items.length > 0);
  }, [filtered, hasMultipleClasses]);

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(accountId: string) {
    onChange(accountId);
    setOpen(false);
    setQuery('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {open ? (
        <div className="flex h-9 w-full items-center rounded-md border border-ring bg-background px-2 shadow-sm ring-2 ring-ring">
          <Search size={12} className="mr-1.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type code or name…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                setQuery('');
              }
              if (e.key === 'Enter' && filtered.length === 1) {
                handleSelect(filtered[0].id);
              }
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:border-ring/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={cn('truncate text-left', !selected && 'text-muted-foreground')}>
            {displayLabel || placeholder}
          </span>
          <div className="flex shrink-0 items-center gap-0.5 ml-2">
            {selected && !disabled && (
              <span
                onClick={handleClear}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X size={11} />
              </span>
            )}
            <ChevronDown size={14} className="text-muted-foreground" />
          </div>
        </button>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-background shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No accounts match "{query}"
            </div>
          ) : (
            groups.map(({ cls, items }) => (
              <div key={cls ?? '_'}>
                {cls && (
                  <div className="sticky top-0 bg-muted/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {cls}
                  </div>
                )}
                {items.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelect(a.id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent',
                      a.id === value && 'bg-primary/10 text-primary font-medium',
                    )}
                  >
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground w-16">
                      {a.code}
                    </span>
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
