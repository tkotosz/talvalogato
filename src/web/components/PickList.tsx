import { useState } from 'react';
import { Search } from 'lucide-react';

const searchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('hu')
    .trim();

/**
 * A searchable checkbox list in the code filter's layout, without its groups: a search field, the chosen items, the list,
 * and a button that clears the choice. A ticked item is chosen.
 */
export function PickList<Key extends string>({
  label,
  hint,
  keys,
  names,
  selected,
  onChange,
}: {
  /** What the chosen items are, such as "Kizárt allergének". */
  label: string;
  hint: string;
  keys: Key[];
  names: Record<Key, string>;
  selected: Key[];
  onChange(selected: Key[]): void;
}) {
  const [query, setQuery] = useState('');
  const search = searchText(query);
  const matches = keys.filter(key => searchText(names[key]).includes(search));
  const chosen = keys.filter(key => selected.includes(key));

  return (
    <>
      <p className="preference-hint">{hint}</p>
      <label className="code-search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          aria-label={`Keresés: ${label}`}
          placeholder="Keresés"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') event.preventDefault();
          }}
        />
      </label>
      <div className="code-filter-results">
        {chosen.length > 0 && (
          <p className="excluded-codes">
            <strong>{label}</strong> {chosen.map(key => names[key]).join(', ')}
          </p>
        )}
        {matches.length ? (
          <ul className="code-items pick-list" aria-label={label}>
            {matches.map(key => (
              <li key={key}>
                <label>
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
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">Nincs találat.</p>
        )}
      </div>
      <div className="modal-actions code-filter-actions">
        <button type="button" className="text-button" disabled={!chosen.length} onClick={() => onChange([])}>
          Kizárások törlése
        </button>
      </div>
    </>
  );
}
