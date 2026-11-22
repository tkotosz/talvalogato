import { useState } from 'react';
import { Plus, TriangleAlert, X } from 'lucide-react';
import { allAllergens, allergenNames, inAllergenOrder } from '../../core/allergens.ts';
import {
  allDislikes,
  allergenIssue,
  dietIssue,
  dislikeIssue,
  dislikeRules,
  minDislikeLetters,
  ownDislikeWord,
} from '../../core/filters.ts';
import { maxOwnDislikes } from '../../core/planning.ts';
import type { Dish, Preferences } from '../../core/types.ts';

/** The settings this part of the form edits. */
export type DietSettings = Pick<
  Preferences,
  'diet' | 'filterAllergens' | 'excludedAllergens' | 'allergenNoticeAccepted' | 'filterDislikes' | 'dislikes' | 'ownDislikes'
>;

const dietNames: Record<Preferences['diet'], string> = {
  all: 'Mindent eszem',
  vegetarian: 'Vegetáriánus',
  vegan: 'Vegán',
};

/** How many of the week's dishes a filter leaves out, once the week's menu has loaded. */
function HiddenCount({ catalog, hides }: { catalog: Dish[] | null; hides(dish: Dish): boolean }) {
  if (!catalog?.length) return null;
  return (
    <p className="preference-hint" role="status">
      Ezen a héten elrejtve: {catalog.filter(hides).length} / {catalog.length} tétel
    </p>
  );
}

/** A grid of checkboxes that edits a list of keys. */
function Checklist<Key extends string>({
  label,
  keys,
  names,
  selected,
  onChange,
}: {
  label: string;
  keys: Key[];
  names: Record<Key, string>;
  selected: Key[];
  onChange(selected: Key[]): void;
}) {
  return (
    <fieldset className="preference-checklist">
      <legend className="visually-hidden">{label}</legend>
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
    </fieldset>
  );
}

/**
 * The diet, allergen and dislike filters of the settings. The allergen filter can only be saved once the user confirmed that
 * the allergen data must be checked on Teletál.
 */
export function DietFilters({
  value,
  onChange,
  catalog,
  demo,
}: {
  value: DietSettings;
  onChange(changes: Partial<DietSettings>): void;
  /** The active week's dishes, to show how many each filter hides, or null while they load. */
  catalog: Dish[] | null;
  /** The menu is the invented demo. */
  demo: boolean;
}) {
  const [ownWord, setOwnWord] = useState('');
  const [ownWordError, setOwnWordError] = useState('');
  // The full notice stays while the settings are open, so ticking Értem does not make it vanish; once saved, a short
  // reminder replaces it.
  const [showFullNotice] = useState(!value.allergenNoticeAccepted);
  const dislikeNames = Object.fromEntries(allDislikes.map(dislike => [dislike, dislikeRules[dislike].name])) as Record<
    (typeof allDislikes)[number],
    string
  >;

  function addOwnWord() {
    const word = ownDislikeWord(ownWord);
    if (!word) return setOwnWordError(`Legalább ${minDislikeLetters} betűt írj be.`);
    if (value.ownDislikes.length >= maxOwnDislikes)
      return setOwnWordError(`Legfeljebb ${maxOwnDislikes} saját szót adhatsz meg.`);
    setOwnWordError('');
    setOwnWord('');
    if (!value.ownDislikes.includes(word)) onChange({ ownDislikes: [...value.ownDislikes, word] });
  }

  return (
    <>
      <fieldset className="preference-section">
        <legend>Étrend</legend>
        <div className="preference-options">
          {(['all', 'vegetarian', 'vegan'] as const).map(diet => (
            <label key={diet}>
              <input type="radio" name="diet" checked={value.diet === diet} onChange={() => onChange({ diet })} />
              {dietNames[diet]}
            </label>
          ))}
        </div>
        <p className="preference-hint">
          A Teletál jelölései alapján. Nem allergiaszűrő: a vegán jelölés nem zárja ki, hogy egy étel nyomokban tejet vagy tojást
          tartalmazzon.
        </p>
        {value.diet === 'vegan' && (
          <p className="preference-hint">
            A Teletál menüi nem vegánok, ezért vegán étrenddel a Saját menü és a Menü generálása kínál választást.
          </p>
        )}
        {value.diet !== 'all' && <HiddenCount catalog={catalog} hides={dish => dietIssue(dish, value) !== null} />}
      </fieldset>

      <label className="preference-toggle">
        <input
          type="checkbox"
          checked={value.filterAllergens}
          onChange={event => onChange({ filterAllergens: event.target.checked })}
        />
        Allergének kizárása
      </label>
      {value.filterAllergens && (
        <div className="preference-section">
          {!showFullNotice ? (
            <p className="preference-hint">
              Rendelés előtt ellenőrizd az allergéneket a Teletál oldalán is. Az allergénadat nélküli ételeket elrejtjük.
            </p>
          ) : (
            <div className="allergen-notice" role="note">
              <TriangleAlert size={19} aria-hidden="true" />
              <div>
                <p>
                  Az allergénadatokat a Tálválogató automatikusan veszi át a Teletál oldaláról, ezért elavultak vagy hibásak
                  lehetnek.
                </p>
                <p>
                  Nyomokban akkor is lehet allergén egy ételben, ha nincs feltüntetve: a Teletál maga is jelzi, hogy egyes ételei
                  a többivel közös konyhán készülnek, így a keresztszennyeződés nem zárható ki.
                </p>
                <p>Az allergénadat nélküli ételeket elrejtjük. Rendelés előtt minden ételt ellenőrizz a Teletál oldalán.</p>
                {demo && <p>A bemutató ételei és allergénjei kitaláltak.</p>}
                <label className="allergen-confirm">
                  <input
                    type="checkbox"
                    checked={value.allergenNoticeAccepted}
                    onChange={event => onChange({ allergenNoticeAccepted: event.target.checked })}
                  />
                  Értem, rendelés előtt ellenőrzöm az allergéneket a Teletál oldalán.
                </label>
              </div>
            </div>
          )}
          <Checklist
            label="Kizárt allergének"
            keys={allAllergens}
            names={allergenNames}
            selected={value.excludedAllergens}
            onChange={excludedAllergens => onChange({ excludedAllergens: inAllergenOrder(excludedAllergens) })}
          />
          {value.excludedAllergens.length > 0 && (
            <HiddenCount catalog={catalog} hides={dish => allergenIssue(dish, value) !== null} />
          )}
        </div>
      )}

      <label className="preference-toggle">
        <input
          type="checkbox"
          checked={value.filterDislikes}
          onChange={event => onChange({ filterDislikes: event.target.checked })}
        />
        Kerülendő összetevők
      </label>
      {value.filterDislikes && (
        <div className="preference-section">
          <p className="preference-hint">
            Szavakat keres az ételek nevében és összetevőiben, ezért nem helyettesíti az allergénszűrőt.
          </p>
          <Checklist
            label="Gyakori kerülendő összetevők"
            keys={allDislikes}
            names={dislikeNames}
            selected={value.dislikes}
            onChange={dislikes => onChange({ dislikes })}
          />
          <div className="own-dislike">
            <label htmlFor="own-dislike">Saját szó</label>
            <span className="own-dislike-field">
              <input
                id="own-dislike"
                type="text"
                placeholder="pl. olívabogyó"
                value={ownWord}
                onChange={event => setOwnWord(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  addOwnWord();
                }}
              />
              <button type="button" className="button secondary" onClick={addOwnWord}>
                <Plus size={17} aria-hidden="true" /> Hozzáadás
              </button>
            </span>
          </div>
          {ownWordError && (
            <p className="form-error" role="status">
              {ownWordError}
            </p>
          )}
          {value.ownDislikes.length > 0 && (
            <ul className="own-dislikes" aria-label="Saját kerülendő szavak">
              {value.ownDislikes.map(word => (
                <li key={word}>
                  <span>{word}</span>
                  <button
                    type="button"
                    aria-label={`${word} törlése`}
                    onClick={() => onChange({ ownDislikes: value.ownDislikes.filter(item => item !== word) })}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(value.dislikes.length > 0 || value.ownDislikes.length > 0) && (
            <HiddenCount catalog={catalog} hides={dish => dislikeIssue(dish, value) !== null} />
          )}
        </div>
      )}
    </>
  );
}
