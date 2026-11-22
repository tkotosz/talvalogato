import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A dropdown field whose list holds a checkbox per option. The field shows the chosen options, or `placeholder` when none
 * is chosen. The list closes on Escape and on a click outside it.
 */
export function MultiSelect<Key extends string>({
  label,
  placeholder,
  keys,
  names,
  selected,
  onChange,
}: {
  label: string;
  placeholder: string;
  keys: Key[];
  names: Record<Key, string>;
  selected: Key[];
  onChange(selected: Key[]): void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const chosen = keys.filter(key => selected.includes(key));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div
      className="multi-select"
      ref={root}
      onKeyDown={event => {
        // Escape closes the list, not the settings dialog around it.
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <span className="multi-select-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        className="multi-select-field"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen(value => !value)}
      >
        <span id={`${id}-value`} className={chosen.length ? undefined : 'multi-select-placeholder'}>
          {chosen.length ? chosen.map(key => names[key]).join(', ') : placeholder}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-list`} className="multi-select-list" role="group" aria-labelledby={`${id}-label`}>
          {keys.map(key => (
            <label key={key}>
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={event =>
                  onChange(
                    event.target.checked
                      ? keys.filter(item => item === key || selected.includes(item))
                      : selected.filter(item => item !== key),
                  )
                }
              />
              {names[key]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
