(async function () {
  const K = window.KinoDates;
  const S = K.settings;
  const { $, esc, store } = K;
  const LK = "kino.dates.mine." + S.pollId;
  const ym = S.months[0];
  // Список времён открывается в клетке; на телефоне — снизу листом.
  const touch = !matchMedia("(hover: hover) and (pointer: fine)").matches;

  // Мой ответ. Сначала берём из браузера, чтобы страница открылась сразу с отметками.
  const state = (() => {
    let raw = null;
    try { raw = JSON.parse(store.get(LK)); } catch {}
    const a = K.normalize(raw);
    a.same = false;
    return a;
  })();
  let others = {}; // { voterId: ответ } — все, кроме меня
  let backend;

  const selected = () => Object.keys(state.days).sort();
  const slotIndex = (r) => S.slots.findIndex((s) => s.from === r[0] && s.to === r[1]);
  const shortOf = (r) => { const i = slotIndex(r); return i >= 0 ? S.slots[i].short : K.fmtRange(r); };
  // Совсем коротко для узкой клетки на телефоне: «с 19:00» → «19:00», «весь день» → «весь».
  const tinyOf = (r) => shortOf(r).replace(/^с\s+/i, "").split(" ")[0];
  // Несколько времён в один день: первое и «+N».
  const listShort = (list) => shortOf(list[0]) + (list.length > 1 ? ` +${list.length - 1}` : "");
  const listTiny = (list) => tinyOf(list[0]) + (list.length > 1 ? `+${list.length - 1}` : "");

  // ---------- календарь на весь экран ----------
  function renderBoard() {
    const [y, m] = ym.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const total = new Date(y, m, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const rows = Math.ceil((lead + total) / 7);
    $("#d-month").innerHTML = `${K.MONTHS[m - 1]} <span>${y}</span>`;

    let html = K.WD.map((w, i) => `<div class="wd${i > 4 ? " we" : ""}">${w}</div>`).join("");
    for (let i = 0; i < lead; i++) html += `<div class="cell blank" aria-hidden="true"></div>`;
    for (let d = 1; d <= total; d++) {
      const k = K.keyOf(y, m, d);
      const we = (new Date(y, m - 1, d).getDay() + 6) % 7 > 4;
      if (k < K.todayKey) { html += `<div class="cell past${we ? " we" : ""}"><span class="dn">${d}</span></div>`; continue; }
      html += `<div class="cell${we ? " we" : ""}" data-k="${k}"tabindex="0" role="button" aria-haspopup="listbox" aria-label="${esc(K.fmtDayLong(k))}: во сколько удобно">
        <span class="dn">${d}</span>
        <span class="cnt"></span>
        <span class="pick"><span class="pick-text">время</span><span class="pick-tiny"></span><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </div>`;
    }
    const board = $("#d-board");
    board.style.setProperty("--rows", rows);
    board.innerHTML = html;
    updateBoard();
  }

  function countFor(k) {
    let n = state.days[k] ? 1 : 0;
    for (const a of Object.values(others)) if (a.days[k]) n++;
    return n;
  }

  function updateBoard() {
    document.querySelectorAll("#d-board .cell[data-k]").forEach((el) => {
      const k = el.dataset.k;
      const r = state.days[k];
      el.classList.toggle("on", !!r);
      el.querySelector(".pick-text").textContent = r ? listShort(r) : "время";
      el.querySelector(".pick-tiny").textContent = r ? listTiny(r) : "+";
      const n = S.showCounts ? countFor(k) : 0;
      const cnt = el.querySelector(".cnt");
      cnt.textContent = n || "";
      cnt.title = n ? `Отметили: ${K.people(n)}` : "";
    });
  }

  // "" — «Не могу» (снять день); число — включить или выключить это время; "c" — время из старой версии, не трогаем.
  function choose(k, value) {
    if (value === "") delete state.days[k];
    else if (value !== "c") {
      const s = S.slots[Number(value)];
      const list = (state.days[k] || []).slice();
      const i = list.findIndex((r) => r[0] === s.from && r[1] === s.to);
      if (i >= 0) list.splice(i, 1); else list.push([s.from, s.to]);
      list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (list.length) state.days[k] = list; else delete state.days[k];
    }
    changed();
  }

  // Компьютер: свой список, раскрывается прямо из клетки.
  let openCell = null;
  function closeMenu(focusCell) {
    if (!openCell) return;
    openCell.querySelector(".menu")?.remove();
    openCell.classList.remove("open", "up", "left");
    document.body.classList.remove("sheet-open");
    openCell.setAttribute("aria-expanded", "false");
    if (focusCell) openCell.focus();
    openCell = null;
  }
  function openMenu(cell) {
    closeMenu();
    const k = cell.dataset.k;
    const list = state.days[k] || [];
    const isOn = (r) => list.some((x) => x[0] === r[0] && x[1] === r[1]);
    // Время из старой версии страницы, которого нет в списке, показываем отдельным пунктом.
    const custom = list.filter((r) => slotIndex(r) < 0);
    const items = [...S.slots.map((s, i) => [String(i), s.label, isOn([s.from, s.to])]), ...custom.map((r) => ["c", K.fmtRange(r), true])];
    const menu = document.createElement("div");
    menu.className = "menu" + (touch ? " sheet" : "");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-multiselectable", "true");
    menu.innerHTML = `<div class="menu-head"><span>${esc(K.fmtDayLong(k))}<small>можно выбрать несколько</small></span><button type="button" class="menu-done">Готово</button></div>` +
      items.map(([v, label, on]) =>
        `<button type="button" role="option" class="menu-item" data-v="${v}" aria-selected="${on}">${esc(label)}</button>`).join("") +
      `<button type="button" role="option" class="menu-item none" data-v="" aria-selected="false">Не могу в этот день</button>`;
    cell.appendChild(menu);
    cell.classList.add("open");
    cell.setAttribute("aria-expanded", "true");
    if (touch) {
      document.body.classList.add("sheet-open");
    } else {
      // Не даём списку уйти за край экрана.
      const box = cell.getBoundingClientRect();
      const mh = menu.offsetHeight, mw = menu.offsetWidth;
      if (box.top + 8 + mh > innerHeight && box.bottom - mh > 0) cell.classList.add("up");
      if (box.left + mw > document.documentElement.clientWidth - 8) cell.classList.add("left");
    }
    openCell = cell;
    (menu.querySelector('[aria-selected="true"]') || menu.querySelector(".menu-item")).focus({ preventScroll: true });
  }
  {
    $("#d-board").addEventListener("click", (e) => {
      if (e.target.closest(".menu-done")) { closeMenu(true); return; }
      const item = e.target.closest(".menu-item");
      if (item) {
        const cell = item.closest(".cell");
        choose(cell.dataset.k, item.dataset.v);
        if (item.dataset.v === "") { closeMenu(true); return; }
        // список остаётся открытым: можно отметить ещё время
        const keep = cell.querySelector(".menu").scrollTop;
        const v = item.dataset.v;
        closeMenu();
        openMenu(cell);
        const m = cell.querySelector(".menu");
        m.scrollTop = keep;
        (m.querySelector(`.menu-item[data-v="${v}"]`) || m).focus({ preventScroll: true });
        return;
      }
      if (e.target.closest(".menu")) return;
      const cell = e.target.closest(".cell[data-k]");
      if (!cell) return;
      if (cell === openCell) closeMenu(); else openMenu(cell);
    });
    $("#d-board").addEventListener("keydown", (e) => {
      const cell = e.target.closest(".cell[data-k]");
      if (!cell) return;
      if (e.key === "Escape") { closeMenu(true); return; }
      if (e.target === cell && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) { e.preventDefault(); openMenu(cell); return; }
      if (e.target.classList.contains("menu-item") && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const list = [...cell.querySelectorAll(".menu-item")];
        const i = list.indexOf(e.target) + (e.key === "ArrowDown" ? 1 : -1);
        list[(i + list.length) % list.length].focus();
      }
    });
    document.addEventListener("pointerdown", (e) => { if (openCell && !openCell.contains(e.target)) closeMenu(); });
    $("#d-board").addEventListener("focusout", (e) => { if (openCell && !openCell.contains(e.relatedTarget) && e.relatedTarget) closeMenu(); });
  }

  // ---------- имя ----------
  const nameInput = $("#d-name");
  nameInput.value = state.name;
  nameInput.addEventListener("input", () => { state.name = nameInput.value.trim().slice(0, 60); changed(true); });

  // ---------- сохранение ----------
  const saveText = (t) => ($("#d-save-text").textContent = t);
  const savedText = (n) => (n ? `Сохранено · ${K.daysWord(n)}${backend && backend.mode === "demo" ? " (только в этом браузере)" : ""}` : "Отметьте хотя бы один день");
  let timer = null;
  let saving = Promise.resolve();

  function persistLocal() {
    store.set(LK, JSON.stringify({ ...K.serialize(state), updatedAt: state.updatedAt }));
  }

  function changed(quiet) {
    state.updatedAt = Date.now();
    persistLocal();
    updateBoard();
    $("#d-clear").hidden = !selected().length;
    clearTimeout(timer);
    if (!quiet) saveText("Сохраняю…");
    timer = setTimeout(push, quiet ? 900 : 300);
  }

  function push() {
    if (!backend) return;
    const n = selected().length;
    saving = saving.then(() => backend.save(n ? K.serialize(state) : null)).then(
      () => saveText(savedText(n)),
      (err) => {
        console.error(err);
        saveText("Не сохранилось — попробуйте ещё раз");
        note("<b>Нет доступа к базе.</b> Проверьте правила (Rules) в Firebase — см. README.md, раздел «Выбор дат».");
      }
    );
  }

  $("#d-clear").addEventListener("click", () => {
    if (!confirm("Снять все отмеченные дни?")) return;
    state.days = {};
    changed();
  });

  function note(html) {
    const el = $("#d-note");
    el.innerHTML = html;
    el.hidden = !html;
  }

  // ---------- старт ----------
  renderBoard();
  $("#d-clear").hidden = !selected().length;
  if (selected().length) saveText(`Выбрано: ${K.daysWord(selected().length)}`);

  backend = await K.connect(note);
  const dot = $("#d-live-dot");
  if (backend.mode === "demo") { dot.classList.add("demo"); dot.title = "Демо-режим"; }

  let first = true;
  backend.subscribe(
    (all) => {
      others = {};
      let mine = null;
      for (const [id, raw] of Object.entries(all || {})) {
        if (id === K.voterId) mine = K.normalize(raw);
        else others[id] = K.normalize(raw);
      }
      if (first) {
        first = false;
        // На другом устройстве или после очистки браузера подтягиваем свой ответ из базы.
        if (mine && mine.updatedAt > state.updatedAt) {
          Object.assign(state, mine, { same: false });
          nameInput.value = state.name;
          persistLocal();
          $("#d-clear").hidden = !selected().length;
          saveText(savedText(selected().length));
        } else if (selected().length && (!mine || mine.updatedAt < state.updatedAt)) {
          push(); // в базе нет последней версии — досылаем
        } else if (selected().length) {
          saveText(savedText(selected().length));
        }
      }
      updateBoard();
    },
    (err) => { console.error(err); note("<b>Нет доступа к базе дат.</b> Проверьте правила (Rules) в Firebase — см. README.md, раздел «Выбор дат»."); },
    (connected) => {
      if (backend.mode === "demo") return;
      dot.classList.toggle("on", connected);
      dot.title = connected ? "Онлайн — сохраняется автоматически" : "Нет соединения";
    }
  );
})();
