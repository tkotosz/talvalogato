import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { loadMenuCatalog } from './menu-client.js';

const collator = new Intl.Collator('hu', { numeric: true, sensitivity: 'base' });
const searchText = value => value.normalize('NFD').replace(/[()\p{Diacritic}]/gu, '').toLocaleLowerCase('hu').trim();
const compareGroups = (a, b) => collator.compare(a.label, b.label);

function getGroup(groups, label) {
  if (!groups.has(label)) groups.set(label, { label, codes: new Set(), matches: new Map(), sections: new Map() });
  return groups.get(label);
}

function groupedCodes(catalog, query) {
  const codeQuery = query.replace(/^menu\s+/, '');
  const exactCode = catalog.some(dish => dish.code.toLowerCase() === codeQuery);
  const groups = new Map();
  for (const { category, cuisine, code, name, menuName } of catalog) {
    const root = getGroup(groups, cuisine || category || 'Egyéb');
    const group = category && category !== root.label ? getGroup(root.sections, category) : root;
    root.codes.add(code);
    group.codes.add(code);
    const match = exactCode ? code.toLowerCase() === codeQuery
      : searchText(`${menuName ?? ''} ${code} ${root.label} ${group.label} ${name}`).includes(query);
    if (match && !group.matches.has(code)) group.matches.set(code, { name, menuName });
  }
  return [...groups.values()].filter(group => group.matches.size || [...group.sections.values()].some(section => section.matches.size))
    .sort(compareGroups);
}

function CodeGroup({ group, excluded, setIncluded, searching }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const open = expanded || searching;
  const includedCount = [...group.codes].filter(code => !excluded.has(code)).length;
  const checked = includedCount === group.codes.size;
  const groupLabel = `${group.label} összes kódja`;
  const title = <><span>{group.label}</span><small>{includedCount}/{group.codes.size}</small></>;
  const sections = [...group.sections.values()].filter(section => section.matches.size).sort(compareGroups);

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
      {open && sections.length > 0 && <ul className="code-groups code-subgroups">
        {sections.map(section => <CodeGroup key={section.label} group={section} excluded={excluded}
          setIncluded={setIncluded} searching={searching} />)}
      </ul>}
      {open && group.matches.size > 0 && <ul className="code-items">
        {[...group.matches.entries()].sort(([a], [b]) => collator.compare(a, b)).map(([code, { name, menuName }]) => <li key={code}>
          <label>
            <input type="checkbox" checked={!excluded.has(code)} onChange={event => setIncluded([code], event.target.checked)} />
            {menuName ? <span>
              <strong>{menuName} <span className="meal-code">{code}</span></strong>
              {name && <span className="code-example">{name}</span>}
            </span> : <><span className="meal-code">{code}</span>{name && <span>{name}</span>}</>}
          </label>
        </li>)}
      </ul>}
    </div>
  </li>;
}

export function CodeFilter({ week, excludedCodes, onChange, onClose }) {
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ phase: 'loading' });
  const excluded = new Set(excludedCodes);
  const search = searchText(query);
  const groups = useMemo(() => groupedCodes(state.catalog ?? [], search), [state.catalog, search]);

  useEffect(() => {
    const aborter = new AbortController();
    const { signal } = aborter;
    loadMenuCatalog(week, signal).then(catalog => {
      if (!signal.aborted) setState({ phase: 'ready', catalog });
    }).catch(error => {
      if (!signal.aborted) setState({ phase: 'error', message: error.message });
    });
    return () => aborter.abort();
  }, [week, attempt]);

  function setIncluded(codes, included) {
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
      <input type="search" aria-label="Keresés az ételkódok között" placeholder="Kód, csoport vagy étel neve"
        value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    <div className="code-filter-results">
      {excluded.size > 0 && <p className="excluded-codes"><strong>Kizárt kódok</strong> {excludedCodes.join(', ')}</p>}
      {state.phase === 'loading' ? <p role="status">Ételkódok betöltése…</p>
        : state.phase === 'error' ? <p role="alert">{state.message} <button type="button" className="text-button" onClick={() => {
          setState({ phase: 'loading' });
          setAttempt(value => value + 1);
        }}>Újra</button></p>
          : groups.length ? <ul className="code-groups">
            {groups.map(group => <CodeGroup key={group.label} group={group} excluded={excluded}
              setIncluded={setIncluded} searching={Boolean(search)} />)}
          </ul> : <p role="status">{search ? 'Nincs találat.' : 'Ehhez a héthez nincs megjeleníthető kód.'}</p>}
    </div>
    <div className="modal-actions code-filter-actions">
      <button type="button" className="text-button" disabled={!excluded.size} onClick={() => onChange([])}>Kizárások törlése</button>
      <button type="button" className="button primary" onClick={onClose}>Kész</button>
    </div>
  </>;
}
