import { useState } from 'react';
import { Plus, TriangleAlert, X } from 'lucide-react';
import { allAllergens, allergenNames, inAllergenOrder } from '../../core/allergens.ts';
import { allDislikes, dislikeRules, minDislikeLetters, ownDislikeWord } from '../../core/filters.ts';
import { maxOwnDislikes } from '../../core/planning.ts';
import type { Preferences } from '../../core/types.ts';
import { PickList } from './PickList.tsx';

/** The settings this part of the form edits. */
export type DietSettings = Pick<
  Preferences,
  'diet' | 'filterAllergens' | 'excludedAllergens' | 'filterDislikes' | 'dislikes' | 'ownDislikes'
>;

const dietNames: Record<Preferences['diet'], string> = {
  all: 'Mindent eszem',
  vegetarian: 'Vegetáriánus',
  vegan: 'Vegán',
};

/** The diet choice of the settings, by Teletál's vegetarian and vegan marks. */
export function DietChoice({ value, onChange }: { value: Preferences['diet']; onChange(diet: Preferences['diet']): void }) {
  return (
    <fieldset className="preference-section">
      <legend>Étrend</legend>
      <div className="preference-options">
        {(['all', 'vegetarian', 'vegan'] as const).map(diet => (
          <label key={diet}>
            <input type="radio" name="diet" checked={value === diet} onChange={() => onChange(diet)} />
            {dietNames[diet]}
          </label>
        ))}
      </div>
      <p className="preference-hint">
        A Teletál jelölései alapján. Nem allergiaszűrő: a vegán jelölés nem zárja ki, hogy egy étel nyomokban tejet vagy tojást
        tartalmazzon.
      </p>
      {value === 'vegan' && (
        <p className="preference-hint">
          A Teletál a vegán jelölést a Vega & vegán szekció leveseire és főételeire teszi, a menüire nem. Ezeket a Saját menü és a
          Menü generálása kínálja.
        </p>
      )}
    </fieldset>
  );
}

/**
 * The allergen and dislike filters of the settings. The allergen filter shows a notice that its data must be checked on
 * Teletál.
 */
export function DietFilters({
  value,
  onChange,
  demo,
}: {
  value: DietSettings;
  onChange(changes: Partial<DietSettings>): void;
  /** The menu is the invented demo. */
  demo: boolean;
}) {
  const [ownWord, setOwnWord] = useState('');
  const [ownWordError, setOwnWordError] = useState('');
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
          <div className="allergen-notice" role="note">
            <p className="allergen-notice-title">
              <TriangleAlert size={16} aria-hidden="true" /> Fontos
            </p>
            <p>
              Az allergénadatokat automatikusan vesszük át a Teletál oldaláról, ezért hibásak vagy elavultak lehetnek. Nyomokban
              akkor is lehet allergén egy ételben, ha nincs feltüntetve: a Teletál maga is jelzi, hogy egyes ételei közös konyhán
              készülnek. Az allergénadat nélküli ételeket elrejtjük. Rendelés előtt ellenőrizd az allergéneket a Teletál oldalán.
              {demo && ' A bemutató ételei és allergénjei kitaláltak.'}
            </p>
          </div>
          <PickList
            label="Kizárt allergének"
            hint="Pipáld be a kizárandó allergéneket."
            keys={allAllergens}
            names={allergenNames}
            selected={value.excludedAllergens}
            onChange={excludedAllergens => onChange({ excludedAllergens: inAllergenOrder(excludedAllergens) })}
          />
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
          <PickList
            label="Kerülendő"
            hint="Pipáld be, amit nem eszel, vagy adj meg saját szót lent."
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
        </div>
      )}
    </>
  );
}
