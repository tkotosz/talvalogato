// Existing Teletál bookmarks use the original fragment and cart progress key.
export async function importOnTeletal() {
  const origin = 'https://www.teletal.hu';
  const storageKey = 'meal-deck.last-cart-import';
  const fragment = '#meal-deck=';
  if (location.origin !== origin || !location.hash.startsWith(fragment)) {
    alert('Nyisd meg a heti étlapot a Tálválogatóból, és ott használd ezt a könyvjelzőt.');
    return;
  }

  class CartError extends Error {}
  try {
    const [id, year, week, lines] = JSON.parse(decodeURIComponent(location.hash.slice(fragment.length)));
    const form = document.getElementById('etlap_form');
    const validLine = line => Array.isArray(line) && line.length === 3
      && Number.isInteger(line[0]) && line[0] >= 1 && line[0] <= 5
      && /^[A-Z0-9][A-Z0-9-]{0,15}$/.test(line[1])
      && Number.isInteger(line[2]) && line[2] >= 1 && line[2] <= 3;
    if (!/^[a-f0-9-]{36}$/i.test(id) || !/^20\d{2}$/.test(year) || !/^\d{1,2}$/.test(week)
      || !Array.isArray(lines) || !lines.length || lines.length > 21 || !lines.every(validLine)
      || form?.getAttribute('ev') !== year || form?.getAttribute('het') !== week
      || new Set(lines.map(([day, code]) => day + ':' + code)).size !== lines.length) {
      throw new CartError('A kiválasztott hét vagy étellista érvénytelen. Nyisd meg újra az étlapot a Tálválogatóból.');
    }

    const address = document.getElementById('select-address')?.value || '-1';
    if (!/^-?\d+$/.test(address)) throw new CartError('Előbb válassz szállítási címet a Teletálon.');
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    const previous = saved?.id === id ? saved : null;
    const goToCart = () => {
      history.replaceState(null, '', location.pathname + location.search);
      location.assign('/kosar');
    };
    if (previous?.done) return goToCart();
    if (previous && previous.address !== address) {
      throw new CartError('Az előző próbálkozás óta megváltozott a szállítási cím. A további ételek hozzáadása előtt ellenőrizd a Teletál-kosaradat.');
    }

    const days = ['', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek'];
    const items = lines.map(([day, code, quantity]) => `${days[day]} ${code} × ${quantity}`);
    if (!confirm(`Hozzáadod ezeket az adagokat a Teletál-kosaradhoz?\n\n${items.join('\n')}\n\nRendelés előtt még ellenőrizheted a kosár tartalmát.`)) return;

    const getCart = async () => {
      const response = await fetch('/kosar', { cache: 'no-store', signal: AbortSignal.timeout?.(12_000) });
      if (!response.ok) throw new CartError('Nem sikerült betölteni a Teletál-kosarat.');
      const cart = new DOMParser().parseFromString(await response.text(), 'text/html');
      const quantities = {};
      for (const input of cart.querySelectorAll('#kosar_form input.kosar-input[data]')) {
        const [itemYear, itemWeek, itemAddress, code, day] = input.getAttribute('data').split('_');
        if (itemYear === year && itemWeek === week && itemAddress === address) {
          quantities[day + ':' + code] = Number(input.value);
        }
      }
      return quantities;
    };

    const current = await getCart();
    const targets = previous?.targets ?? Object.fromEntries(lines.map(([day, code, quantity]) => {
      const key = day + ':' + code;
      return [key, (current[key] || 0) + quantity];
    }));
    localStorage.setItem(storageKey, JSON.stringify({ id, address, targets }));

    const changes = {};
    for (const [day, code, quantity] of lines) {
      const key = day + ':' + code;
      const target = targets[key];
      const actual = current[key] || 0;
      if (actual === target) continue;
      if (actual !== target - quantity) {
        throw new CartError('A kosár tartalma megváltozott az előző próbálkozás óta. A további ételek hozzáadása előtt ellenőrizd a Teletál-kosaradat.');
      }
      (changes[code] ??= {})[day] = String(target);
    }
    if (Object.keys(changes).length) {
      const response = await fetch('/ajax/adagmentes_all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ adagok: { [address]: { [year]: { [week]: changes } } } }),
        signal: AbortSignal.timeout?.(12_000),
      });
      if (!response.ok) throw new CartError('A Teletál nem tudta frissíteni a kosarat. Próbáld újra a könyvjelzővel.');
    }

    const updated = await getCart();
    const missing = Object.keys(targets).filter(key => updated[key] !== targets[key]);
    if (missing.length) {
      alert(`A Teletál nem igazolta vissza ezeket a tételeket (${missing.join(', ')}). Ellenőrizd a kosaradat.`);
    } else {
      localStorage.setItem(storageKey, JSON.stringify({ id, address, targets, done: true }));
    }
    goToCart();
  } catch (error) {
    alert(error instanceof CartError ? error.message : 'Nem sikerült hozzáadni a kiválasztott ételeket. Ellenőrizd a Teletál-kosaradat, majd próbáld újra.');
  }
}

export const shortcutUrl = () => `javascript:${encodeURIComponent(`(${importOnTeletal.toString()})()`)}`;

export function teletalWeekUrl(plan, lines) {
  const [year, weekNumber] = plan.settings.week.split('-W');
  const week = String(Number(weekNumber));
  const payload = [plan.id, year, week, lines.map(({ day, code, quantity }) => [day, code, quantity])];
  return `https://www.teletal.hu/etlap/${week}#meal-deck=${encodeURIComponent(JSON.stringify(payload))}`;
}
