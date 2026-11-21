import { useState } from 'react';
import { Bookmark, ShoppingBasket } from 'lucide-react';
import { deliveryDays } from '../../core/planner.ts';
import { orderSummary } from '../../core/planning.ts';
import type { CartLine, Dish, Plan, Preferences } from '../../core/types.ts';
import { eligibleDays } from '../../core/weeks.ts';
import { maxCartLines, shortcutUrl, teletalWeekUrl } from '../cart-shortcut.ts';
import { copyText } from '../format.ts';

function CartInstructions({ plan, lines }: { plan: Plan; lines: CartLine[] }) {
  const url = teletalWeekUrl(plan, lines);
  const shortcut = shortcutUrl();
  const [copyStatus, setCopyStatus] = useState('');
  return (
    <>
      <p>A választásaidat egy könyvjelző teszi a Teletál-kosárba. A könyvjelzőt csak egyszer kell elmentened.</p>

      <h3 className="instructions-heading">Egyszeri beállítás</h3>
      {/* React refuses javascript: URLs in href, so the bookmark link gets its address directly.
          Dragging it to the bookmarks bar names the bookmark after the link text. */}
      <a
        ref={link => link?.setAttribute('href', shortcut)}
        className="bookmark-chip"
        title="Húzd a könyvjelzősávra, vagy kattints a másoláshoz"
        onClick={event => {
          event.preventDefault();
          copyText(shortcut).then(ok =>
            setCopyStatus(
              ok ? 'Könyvjelzőkód kimásolva.' : 'A másolás nem sikerült. Számítógépen húzd a gombot a könyvjelzősávra.',
            ),
          );
        }}
      >
        <Bookmark size={16} aria-hidden="true" /> Teletál-kosár
      </a>
      {copyStatus && <p role="status">{copyStatus}</p>}
      <ul className="instructions">
        <li>
          <strong>Számítógépen</strong>
          <p>Húzd a „Teletál-kosár” gombot a böngésző könyvjelzősávjára.</p>
        </li>
        <li>
          <strong>Telefonon</strong>
          <p>
            A telefonos Chrome-ban nem lehet ilyen könyvjelzőt létrehozni. Mentsd el számítógépen, a telefonoddal azonos
            Google-fiókba bejelentkezett Chrome-ban, és a szinkronizálás átviszi a telefonodra.
          </p>
        </li>
      </ul>
      <p>
        Ha a könyvjelző egyszer hibát jelez, mentsd el újra ugyanígy: a Tálválogató frissítései néha új könyvjelzőt igényelnek.
      </p>

      <h3 className="instructions-heading">Kosárba helyezés</h3>
      <ol className="instructions">
        <li>
          <p>Nyisd meg a heti étlapot az itt lent található gombbal.</p>
        </li>
        <li>
          <p>
            Amikor az étlap betöltődött, egyszerűen kattints a „Teletál-kosár” könyvjelzőre, hogy automatikusan hozzáadd az
            ételeket a kosárhoz.
          </p>
          <p>
            Telefonon a könyvjelzők listájából nem indul el. Koppints a címsorba, kezdd el beírni, hogy „Teletál-kosár”, és
            válaszd a csillaggal jelölt találatot. Ez gyakran a javaslatok alján van.
          </p>
        </li>
        <li>
          <p>Hagyd jóvá a tételeket. Utána megnyílik a Teletál-kosár, ahol ellenőrizheted és leadhatod a rendelést.</p>
        </li>
      </ol>
      <a className="button primary wide" href={url} target="_blank" rel="noreferrer">
        <ShoppingBasket size={19} /> Heti étlap megnyitása a Teletálon
      </a>
    </>
  );
}

/** Explains how to send the week's orderable picks to the Teletál cart. */
export function CartDialogContent({
  plan,
  catalog,
  preferences,
}: {
  plan: Plan;
  /** The week's dishes as last published. */
  catalog: Dish[];
  preferences: Preferences;
}) {
  // The bookmark reads Teletál's cart afterwards and reports anything that did not arrive.
  const { lines, issues } = orderSummary(plan, eligibleDays(plan.week, new Date(), deliveryDays(catalog)), catalog, preferences);
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
