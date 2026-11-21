import { useId, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { CatalogDish, WeekKey } from '../../core/types.ts';
import { loadMenuCatalog } from '../menu-client.ts';
import { useLoad } from '../useLoad.ts';

interface CodeGroupData {
  id: string;
  label: string;
  codes: Set<string>;
  /** Codes matching the search, with their menu names. */
  matches: Map<string, string>;
}

const collator = new Intl.Collator('hu', { numeric: true, sensitivity: 'base' });
const searchText = (value: string) => value.normalize('NFD').replace(/[()\p{Diacritic}]/gu, '').toLocaleLowerCase('hu').trim();

function groupedCodes(catalog: CatalogDish[], query: string): CodeGroupData[] {
  const codeQuery = query.replace(/^menu\s+/, '');
  const exactCode = catalog.some(dish => dish.code.toLowerCase() === codeQuery);
  const groups = new Map<string, CodeGroupData>();
  for (const { section, groupId = section, category, code, menuName } of catalog) {
    const group = groups.get(groupId) ?? { id: groupId, label: category, codes: new Set(), matches: new Map() };
    groups.set(groupId, group);
    group.codes.add(code);
    const match = exactCode ? code.toLowerCase() === codeQuery
      : searchText(`${code} ${menuName} ${category}`).includes(query);
    if (match && !group.matches.has(code)) group.matches.set(code, menuName);
  }
  return [...groups.values()].filter(group => group.matches.size);
}

function CodeGroup({ group, excluded, setIncluded, searching }: {
  group: CodeGroupData;
  excluded: Set<string>;
  setIncluded(codes: Iterable<string>, included: boolean): void;
  searching: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const open = expanded || searching;
  const includedCount = [...group.codes].filter(code => !excluded.has(code)).length;
  const checked = includedCount === group.codes.size;
  const groupLabel = `${group.label} összes kódja`;
  const title = <><span>{group.label}</span><small>{includedCount}/{group.codes.size}</small></>;

  return <li className="code-group">
    <div className="code-group-header">
      <label className="code-group-check" title={groupLabel}>
        <input type="checkbox" aria-label={groupLabel} checked={checked}
          ref={input => { if (input) input.indeterminate = includedCount > 0 && !checked; }}
          onChange={event => setIncluded(group.codes, event.target.checked)} />
      </label>
      {searching ? <span className="code-group-title">{title}</span>
        : <button type="button" className="code-group-title" aria-expanded={open} aria-controls={id}
          onClick={() => setExpanded(value => !value)}>
          {title}<ChevronDown size={16} aria-hidden="true" />
        </button>}
    </div>
    <div id={id} hidden={!open}>
      {open && <ul className="code-items">
        {[...group.matches].map(([code, menuName]) => <li key={code}>
          <label>
            <input type="checkbox" checked={!excluded.has(code)} onChange={event => setIncluded([code], event.target.checked)} />
            <span className="meal-code">{code}</span>{menuName !== code && <span>{menuName}</span>}
          </label>
        </li>)}
      </ul>}
    </div>
  </li>;
}

export function CodeFilter({ week, excludedCodes, onChange }: {
  week: WeekKey;
  excludedCodes: string[];
  onChange(codes: string[]): void;
}) {
  const [query, setQuery] = useState('');
  const { state, retry } = useLoad(week, signal => loadMenuCatalog(week, signal));
  const excluded = new Set(excludedCodes);
  const search = searchText(query);
  const catalog = state.phase === 'ready' ? state.value : null;
  const groups = useMemo(() => groupedCodes(catalog ?? [], search), [catalog, search]);

  function setIncluded(codes: Iterable<string>, included: boolean) {
    const next = new Set(excluded);
    for (const code of codes) {
      if (included) next.delete(code);
      else next.add(code);
    }
    onChange([...next].sort(collator.compare));
  }

  return <>
    <p>Vedd ki a pipát egy kód vagy egy egész csoport kizárásához.</p>
    <label className="code-search">
      <Search size={17} aria-hidden="true" />
      <input type="search" aria-label="Keresés az ételkódok között" placeholder="Kód, csoport vagy menünév"
        value={query} onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
    </label>
    <div className="code-filter-results">
      {excluded.size > 0 && <p className="excluded-codes"><strong>Kizárt kódok</strong> {excludedCodes.join(', ')}</p>}
      {state.phase === 'loading' ? <p role="status">Ételkódok betöltése…</p>
        : state.phase === 'error' ? <p role="alert">{state.message} <button type="button" className="text-button" onClick={retry}>Újra</button></p>
          : groups.length ? <ul className="code-groups">
            {groups.map(group => <CodeGroup key={group.id} group={group} excluded={excluded}
              setIncluded={setIncluded} searching={Boolean(search)} />)}
          </ul> : <p role="status">{search ? 'Nincs találat.' : 'Ehhez a héthez nincs megjeleníthető kód.'}</p>}
    </div>
    <div className="modal-actions code-filter-actions">
      <button type="button" className="text-button" disabled={!excluded.size} onClick={() => onChange([])}>Kizárások törlése</button>
    </div>
  </>;
}
