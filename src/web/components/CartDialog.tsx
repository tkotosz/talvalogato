import { useState } from 'react';
import { Bookmark, ShoppingBasket } from 'lucide-react';
import { deliveryDays } from '../../core/planner.ts';
import { orderSummary } from '../../core/planning.ts';
import type { CartLine, CatalogDish, Plan, Preferences } from '../../core/types.ts';
import { eligibleDays } from '../../core/weeks.ts';
import { maxCartLines, shortcutUrl, teletalWeekUrl } from '../cart-shortcut.ts';
import { copyText } from '../format.ts';
import { loadMenuCatalog } from '../menu-client.ts';
import { useLoad } from '../useLoad.ts';

const cartUrl = 'https://www.teletal.hu/kosar';

function CartInstructions({ plan, lines }: { plan: Plan; lines: CartLine[] }) {
  const url = teletalWeekUrl(plan, lines);
  const shortcut = shortcutUrl();
  const [copyStatus, setCopyStatus] = useState('');
  return (
    <>
      <p>
        A kiválasztott ételeket egy könyvjelző segítségével teheted a Teletál-kosárba. Elég egyszer elmentened, utána minden héten
        használhatod.
      </p>
      <ol className="instructions">
        <li>
          <strong>Mentsd el a kosárkönyvjelzőt</strong>
          <p>
            Hozz létre egy <b>Teletál-kosár</b> nevű könyvjelzőt, és cseréld le a címét a kimásolt parancsikonra. Számítógépen a
            hivatkozást a könyvjelzősávra is húzhatod.
          </p>
          {/* React refuses javascript: URLs in href, so the bookmark link gets its address directly. */}
          <a
            ref={link => link?.setAttribute('href', shortcut)}
            className="drag-bookmark"
            onClick={event => {
              event.preventDefault();
              copyText(shortcut).then(ok => setCopyStatus(ok ? 'Parancsikon másolva' : 'Húzd a hivatkozást a könyvjelzősávra.'));
            }}
          >
            <Bookmark size={16} /> Kosárparancsikon másolása vagy húzása
          </a>
          <p>Ha a könyvjelző hibát jelez, mentsd el újra innen: a Tálválogató frissítései néha új könyvjelzőt igényelnek.</p>
          {copyStatus && <p role="status">{copyStatus}</p>}
        </li>
        <li>
          <strong>Nyisd meg a heti étlapot a Teletálon</strong>
          <p>
            Az étlapon nyisd meg a mentett könyvjelzőt, majd hagyd jóvá a mennyiségeket. Mobilon keresd a böngésző könyvjelzői
            között vagy a címsorban.
          </p>
        </li>
        <li>
          <strong>Ellenőrizd a kosarat</strong>
          <p>
            A parancsikon megnyitja a Teletál-kosarat. Ha szükséges, jelentkezz be, majd add le a rendelést, amikor elkészültél.
          </p>
        </li>
      </ol>
      <a className="button primary wide" href={url} target="_blank" rel="noreferrer">
        <ShoppingBasket size={19} /> Heti étlap megnyitása a Teletálon
      </a>
      <a className="text-button existing-cart" target="_blank" rel="noreferrer" href={cartUrl}>
        Teletál-kosár megnyitása
      </a>
    </>
  );
}

/** Rechecks the week's menu with Teletál, then explains how to send the orderable picks to the cart. */
export function CartDialogContent({
  plan,
  preferences,
  onCatalog,
}: {
  plan: Plan;
  preferences: Preferences;
  /** Receives the rechecked catalog, so the overview shows current availability too. */
  onCatalog(catalog: CatalogDish[]): void;
}) {
  const { state, retry } = useLoad(plan.week, async signal => {
    const catalog = await loadMenuCatalog(plan.week, signal, true);
    if (!signal.aborted) onCatalog(catalog);
    return orderSummary(plan, eligibleDays(plan.week, new Date(), deliveryDays(catalog)), catalog, preferences);
  });

  if (state.phase === 'loading') return <p role="status">Rendelhető tételek ellenőrzése…</p>;
  if (state.phase === 'error')
    return (
      <p role="alert">
        {state.message}{' '}
        <button type="button" className="text-button" onClick={retry}>
          Újra
        </button>
      </p>
    );
  const { lines, issues } = state.value;
  if (!lines.length) return <p role="status">A választásaid közül jelenleg egyik sem küldhető a kosárba.</p>;
  if (lines.length > maxCartLines) {
    return (
      <p role="status">
        Egyszerre legfeljebb {maxCartLines} különböző tétel küldhető a kosárba, ez a terv {lines.length} tételt tartalmaz. Hagyj
        ki néhány fogást vagy napot.
      </p>
    );
  }
  return (
    <>
      {Object.keys(issues).length > 0 && (
        <p role="status">A kosárba csak a rendelhető és a beállításaidnak megfelelő tételek kerülnek.</p>
      )}
      <CartInstructions plan={plan} lines={lines} />
    </>
  );
}
