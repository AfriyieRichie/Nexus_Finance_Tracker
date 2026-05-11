import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
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
  const [pos, setPos] = useState<DropdownPos>({ top: 0, left: 0, width: 240, openUpward: false });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = accounts.find((a) => a.id === value);
  const displayLabel = selected ? `${selected.code} — ${selected.name}` : '';

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropH = Math.min(256, window.innerHeight * 0.4);
    const openUpward = spaceBelow < dropH && spaceAbove > spaceBelow;
    setPos({
      top: openUpward ? rect.top + window.scrollY - dropH - 4 : rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
      openUpward,
    });
  }, []);

  function handleOpen() {
    if (disabled) return;
    setQuery('');
    calcPos();
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!open) return;

    function onScroll() { calcPos(); }
    function onResize() { calcPos(); }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    }

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, calcPos]);

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts.filter((a) => a.isActive !== false);
    const q = query.toLowerCase();
    return accounts.filter(
      (a) =>
        a.isActive !== false &&
        (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)),
    );
  }, [accounts, query]);

  const groups = useMemo(() => {
    const classes = new Set(filtered.map((a) => a.class).filter(Boolean));
    if (classes.size <= 1) return [{ cls: null, items: filtered }];
    return CLASS_ORDER.map((cls) => ({
      cls,
      items: filtered.filter((a) => a.class === cls),
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  function handleSelect(accountId: string) {
    onChange(accountId);
    setOpen(false);
    setQuery('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
  }

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          data-account-select-portal=""
          style={{
            position: 'absolute',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
          className="max-h-64 overflow-auto rounded-md border bg-background shadow-xl"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No accounts match "{query}"
            </div>
          ) : (
            groups.map(({ cls, items }) => (
              <div key={cls ?? '_'}>
                {cls && (
                  <div className="sticky top-0 bg-muted/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
                    {cls}
                  </div>
                )}
                {items.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(a.id);
                    }}
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
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={cn('relative', className)}>
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
              if (e.key === 'Escape') { setOpen(false); setQuery(''); }
              if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0].id);
            }}
          />
          <button
            type="button"
            onMouseDown={() => { setOpen(false); setQuery(''); }}
            className="ml-1 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
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
      {dropdown}
    </div>
  );
}
