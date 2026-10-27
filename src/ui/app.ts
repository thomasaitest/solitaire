import { scoreParts, formatNumber, formatTime } from '../game/scoring.ts';
import { commitPendingWin, noteFirstMove, noteWin, revertWin, winRate } from '../game/stats.ts';
import {
  buildPosition,
  createGame,
  draw,
  findFoundationMove,
  legalTargets,
  makeCard,
  moveCards,
  movingCards,
  planAutoComplete,
  restartDeal,
  samePile,
  undo,
} from '../game/engine.ts';
import type { GameState, PileRef } from '../game/types.ts';
import { SUITS } from '../game/types.ts';
import { findHint, stateKey } from '../game/hint.ts';
import { chargePenalty } from '../game/penalty.ts';
import { tapTarget } from '../game/smartTap.ts';
import { loadGame, loadSettings, loadStats, saveGame, saveSettings, saveStats } from '../storage.ts';
import { Capacitor } from '@capacitor/core';
import { cardLabel, suitSvg } from './cards.ts';
import { computeLayout } from './layout.ts';
import { renderTable } from './render.ts';
import { shouldShowInstallHint } from './shell.ts';

interface Gesture {
  pointerId: number;
  kind: 'stock' | 'card';
  from: PileRef | null;
  index: number;
  ids: string[];
  startX: number;
  startY: number;
  dragging: boolean;
}

interface PendingTap {
  from: PileRef;
  index: number;
  id: string;
  at: number;
  timer: number;
}

type ActionKind = 'move' | 'draw' | 'undo' | 'auto';

export function startApp(root: HTMLElement): void {
  const table = document.getElementById('table');
  const undoButton = document.getElementById('undo-btn') as HTMLButtonElement | null;
  const menuButton = document.getElementById('menu-btn');
  const scoreEl = document.getElementById('score');
  const movesEl = document.getElementById('moves');
  const timeEl = document.getElementById('time');
  const newButton = document.getElementById('new-btn');
  const hintButton = document.getElementById('hint-btn');
  const settingsButton = document.getElementById('settings-btn');
  const restartButton = document.getElementById('restart-btn');
  const statusEl = document.getElementById('status');
  const hintEl = document.getElementById('hint');
  const liveEl = document.getElementById('live');
  if (!table || !undoButton || !menuButton || !scoreEl || !movesEl || !timeEl || !statusEl || !hintEl || !liveEl) {
    return;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let settings = loadSettings();
  let stats = loadStats();
  let persistEnabled = true;
  let recordStats = true;
  let state = loadGame() ?? createGame({ drawCount: settings.drawCount });
  const preview = applyDevPreview();
  if (preview) {
    state = preview;
    persistEnabled = false;
    recordStats = false;
  }
  if (state.drawCount !== settings.drawCount && !preview) {
    settings = { ...settings, drawCount: state.drawCount };
    saveSettings(settings);
  }

  let elapsedMs = state.elapsedMs;
  let gesture: Gesture | null = null;
  let pendingTap: PendingTap | null = null;
  let overlayOpen = false;
  let confirmResolve: ((value: boolean) => void) | null = null;
  let autoTimer: number | null = null;
  let suppressAuto = false;
  let winDismissed = false;
  let lastMovedId = '';
  let lastMovedAt = 0;
  let hudCache = '';
  let lastSize = '';
  let lastPersist = elapsedMs;
  let hintTimer: number | null = null;
  /** Positions visited in this deal, so Hint does not send the player back and forth. */
  const seen = new Set<string>();

  seen.add(stateKey(state));
  applyTheme(settings.theme);
  showInstallHint();
  render({ dealing: !preview, flipped: new Set() });
  updateHud();
  if (state.won) openWin();
  else maybeScheduleAuto();

  const resize = new ResizeObserver(() => {
    const key = `${root.clientWidth}x${root.clientHeight}`;
    if (key === lastSize || gesture?.dragging) return;
    lastSize = key;
    render({ dealing: false, flipped: new Set() });
  });
  resize.observe(root);

  table.addEventListener('pointerdown', onPointerDown);
  table.addEventListener('pointermove', onPointerMove);
  table.addEventListener('pointerup', onPointerUp);
  table.addEventListener('pointercancel', onPointerCancel);
  undoButton.addEventListener('click', () => doUndo());
  menuButton.addEventListener('click', () => openMenu());
  settingsButton?.addEventListener('click', () => openMenu());
  newButton?.addEventListener('click', () => void askNewGame());
  restartButton?.addEventListener('click', () => void askRestart());
  hintButton?.addEventListener('click', () => showHint());
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist();
  });
  window.addEventListener('pagehide', () => persist());
  root.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('gesturestart', (event) => event.preventDefault());
  document.addEventListener(
    'touchmove',
    (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.sheet, .modal')) return;
      event.preventDefault();
    },
    { passive: false },
  );

  let lastTick = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const delta = now - lastTick;
    lastTick = now;
    if (!document.hidden && !state.won) elapsedMs += delta;
    updateHud();
    if (elapsedMs - lastPersist > 5000) persist();
  }, 250);

  function applyDevPreview(): GameState | null {
    if (!import.meta.env.DEV) return null;
    const params = new URLSearchParams(location.search);
    const mode = params.get('preview');
    const seed = Number(params.get('seed'));
    if (mode === 'won') {
      return buildPosition({
        drawCount: settings.drawCount,
        foundations: SUITS.map((suit) => Array.from({ length: 13 }, (_, rank) => makeCard(suit, rank + 1, true))),
        score: 520,
        moves: 104,
        elapsedMs: 125_000,
        gameId: 'preview-won',
      });
    }
    if (mode === 'win') {
      return buildPosition({
        drawCount: settings.drawCount,
        foundations: SUITS.map((suit) => Array.from({ length: 12 }, (_, rank) => makeCard(suit, rank + 1, true))),
        tableau: [[makeCard('s', 13)], [makeCard('h', 13)], [makeCard('d', 13)], [makeCard('c', 13)], [], [], []],
        score: 480,
        moves: 96,
        elapsedMs: 200_000,
        gameId: 'preview-win',
      });
    }
    if (Number.isFinite(seed) && seed > 0) {
      return createGame({ seed, drawCount: settings.drawCount, gameId: `seed-${seed}` });
    }
    return null;
  }

  function render(options: { dealing: boolean; flipped: Set<string> }): void {
    const style = getComputedStyle(root);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const width = Math.max(160, root.clientWidth - padX);
    const height = Math.max(160, root.clientHeight - padY - hudHeight() - 8);
    const layout = computeLayout(width, height, state.tableau, state.drawCount);
    const target = document.documentElement;
    target.style.setProperty('--card-w', `${layout.cardW}px`);
    target.style.setProperty('--card-h', `${layout.cardH}px`);
    target.style.setProperty('--gap', `${layout.gap}px`);
    target.style.setProperty('--fan', `${layout.fan}px`);
    target.style.setProperty('--table-w', `${layout.tableW}px`);
    target.style.setProperty('--waste-w', `${layout.wasteW}px`);
    renderTable(table!, state, layout, { ...options, reduce: reduceMotion });
    lastSize = `${root.clientWidth}x${root.clientHeight}`;
  }

  function hudHeight(): number {
    const hud = document.getElementById('hud');
    const dock = document.getElementById('dock');
    const outer = (el: HTMLElement | null, fallback: number): number => {
      if (!el) return fallback;
      const css = getComputedStyle(el);
      return el.offsetHeight + parseFloat(css.marginTop) + parseFloat(css.marginBottom);
    };
    return outer(hud, 64) + (statusEl?.offsetHeight ?? 0) + outer(dock, 0);
  }

  function updateHud(): void {
    const parts = scoreParts(state.score, elapsedMs, state.won);
    const next = `${parts.total}|${state.moves}|${formatTime(elapsedMs)}|${state.drawCount}|${state.undos.length}`;
    if (next === hudCache) return;
    hudCache = next;
    scoreEl!.textContent = formatNumber(parts.total);
    movesEl!.textContent = String(state.moves);
    timeEl!.textContent = formatTime(elapsedMs);
    undoButton!.disabled = state.undos.length === 0;
  }

  function setStatus(text: string): void {
    statusEl!.textContent = text;
  }

  function persist(): void {
    if (!persistEnabled) return;
    lastPersist = elapsedMs;
    saveGame({ ...state, elapsedMs });
  }

  function rememberStats(): void {
    if (!recordStats) return;
    saveStats(stats);
  }

  function syncStats(prev: GameState, next: GameState, kind: ActionKind): void {
    if (!recordStats || prev.gameId !== next.gameId) return;
    if (prev.moves === 0 && next.moves > 0) stats = noteFirstMove(stats, next.gameId);
    if (!prev.won && next.won) stats = noteWin(stats, next.gameId, next.drawCount, elapsedMs);
    if (kind === 'undo' && prev.won && !next.won) stats = revertWin(stats, next.gameId);
    rememberStats();
  }

  function revealed(prev: GameState, next: GameState): Set<string> {
    const before = new Map<string, boolean>();
    for (const pile of prev.tableau) for (const card of pile) before.set(card.id, card.faceUp);
    const ids = new Set<string>();
    for (const pile of next.tableau) {
      for (const card of pile) if (card.faceUp && before.get(card.id) === false) ids.add(card.id);
    }
    return ids;
  }

  function captureRects(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    document.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
      if (el.closest('#drag-layer')) return;
      const id = el.dataset.cardId;
      if (id) map.set(id, el.getBoundingClientRect());
    });
    return map;
  }

  function animateFrom(rects: Map<string, DOMRect>): void {
    if (reduceMotion) return;
    rects.forEach((from, id) => {
      const el = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`);
      if (!el || el.closest('#drag-layer') || el.classList.contains('is-ghost')) return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 190, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
      );
    });
  }

  function shake(el: Element | null): void {
    if (!el || reduceMotion) return;
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 220 },
    );
  }

  function applyResult(prev: GameState, next: GameState, rects: Map<string, DOMRect>, kind: ActionKind): void {
    if (hintTimer !== null) clearHint();
    if (kind === 'draw') {
      const stockRect = document.querySelector('[data-zone="stock"]')?.getBoundingClientRect();
      if (stockRect) {
        const before = new Set(prev.waste.map((card) => card.id));
        for (const card of next.waste) if (!before.has(card.id)) rects.set(card.id, stockRect);
      }
    }
    const flipped = revealed(prev, next);
    state = next;
    seen.add(stateKey(next));
    syncStats(prev, next, kind);
    persist();
    render({ dealing: false, flipped });
    animateFrom(rects);
    updateHud();
    if (!next.won) {
      winDismissed = false;
      if (document.querySelector('.win-dialog')) closeOverlay();
    }
    if (kind === 'move' || kind === 'draw') suppressAuto = false;
    if (kind !== 'auto' && kind !== 'undo' && !suppressAuto) {
      const scheduled = maybeScheduleAuto();
      if (!scheduled && next.won && !prev.won) openWin();
    }
  }

  function doMove(from: PileRef, index: number, to: PileRef, preset?: Map<string, DOMRect>): void {
    clearPending();
    const moving = movingCards(state, from, index);
    const rects = preset ?? captureRects();
    const prev = state;
    const result = moveCards({ ...state, elapsedMs }, from, index, to);
    if (!result.ok) {
      const id = moving?.[0]?.id;
      shake(id ? document.querySelector(`[data-card-id="${CSS.escape(id)}"]`) : null);
      return;
    }
    if (moving?.[0]) {
      lastMovedId = moving[0].id;
      lastMovedAt = performance.now();
    }
    applyResult(prev, result.state, rects, 'move');
  }

  function doDraw(): void {
    if (state.won || overlayOpen) return;
    cancelAuto();
    clearPending();
    const prev = state;
    const rects = captureRects();
    const result = draw({ ...state, elapsedMs });
    if (!result.ok) {
      shake(document.getElementById('stock-btn'));
      return;
    }
    applyResult(prev, result.state, rects, 'draw');
  }

  function doUndo(): void {
    if (gesture?.dragging) return;
    cancelAuto();
    clearPending();
    suppressAuto = true;
    const prev = state;
    const rects = captureRects();
    const result = undo({ ...state, elapsedMs });
    if (!result.ok) return;
    winDismissed = false;
    // The previous position comes back first; the penalty is charged on top of it.
    const charge = chargePenalty(result.state, elapsedMs);
    applyResult(prev, charge.state, rects, 'undo');
    if (charge.charged > 0) showPenalty(charge.charged);
    if (!result.state.won) closeOverlay();
  }

  function maybeScheduleAuto(): boolean {
    if (suppressAuto || autoTimer !== null || gesture || overlayOpen) return false;
    if (!planAutoComplete(state)) return false;
    setStatus('Legger resten på plass');
    autoTimer = window.setTimeout(stepAuto, reduceMotion ? 0 : 420);
    return true;
  }

  function stepAuto(): void {
    autoTimer = null;
    if (gesture || overlayOpen) {
      cancelAuto();
      return;
    }
    const plan = planAutoComplete(state);
    const step = plan?.[0];
    if (!step) {
      setStatus('');
      if (state.won) openWin();
      return;
    }
    const prev = state;
    const rects = captureRects();
    const result = moveCards({ ...state, elapsedMs }, step.from, step.index, step.to);
    if (!result.ok) {
      cancelAuto();
      return;
    }
    applyResult(prev, result.state, rects, 'auto');
    autoTimer = window.setTimeout(stepAuto, reduceMotion ? 0 : 150);
  }

  function cancelAuto(): void {
    if (autoTimer !== null) window.clearTimeout(autoTimer);
    autoTimer = null;
    setStatus('');
  }

  function clearPending(): void {
    if (!pendingTap) return;
    window.clearTimeout(pendingTap.timer);
    pendingTap = null;
  }

  function flushPending(): void {
    if (!pendingTap) return;
    const pending = pendingTap;
    clearPending();
    const still = movingCards(state, pending.from, pending.index);
    if (!still || still[0]?.id !== pending.id) return;
    const best = tapTarget(state, pending.from, pending.index, settings.smartTap);
    if (best) doMove(pending.from, pending.index, best);
  }

  function handleTap(from: PileRef, index: number): void {
    const cards = movingCards(state, from, index);
    const id = cards?.[0]?.id;
    if (!id) {
      shake(document.querySelector(`[data-card-index="${index}"]`));
      return;
    }
    const now = performance.now();
    const foundation = findFoundationMove(state, from, index);
    const best = tapTarget(state, from, index, settings.smartTap);

    if (pendingTap && pendingTap.id === id && now - pendingTap.at < 340) {
      clearPending();
      if (foundation) doMove(from, index, foundation);
      else shake(document.querySelector(`[data-card-id="${CSS.escape(id)}"]`));
      return;
    }

    if (lastMovedId === id && now - lastMovedAt < 280) {
      if (foundation) doMove(from, index, foundation);
      return;
    }

    const ambiguous = Boolean(foundation && best && !samePile(foundation, best));
    if (!ambiguous) {
      if (best) doMove(from, index, best);
      else shake(document.querySelector(`[data-card-id="${CSS.escape(id)}"]`));
      return;
    }

    clearPending();
    pendingTap = {
      from,
      index,
      id,
      at: now,
      timer: window.setTimeout(() => {
        const pending = pendingTap;
        pendingTap = null;
        if (!pending) return;
        const still = movingCards(state, pending.from, pending.index);
        if (!still || still[0]?.id !== pending.id) return;
        const next = tapTarget(state, pending.from, pending.index, settings.smartTap);
        if (next) doMove(pending.from, pending.index, next);
      }, 240),
    };
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || gesture || overlayOpen || state.won) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const zoneEl = target.closest<HTMLElement>('[data-zone]');
    if (!zoneEl) return;
    const zone = readZone(zoneEl);
    if (!zone) return;
    cancelAuto();
    event.preventDefault();

    if (zone.zone === 'stock') {
      gesture = {
        pointerId: event.pointerId,
        kind: 'stock',
        from: zone,
        index: 0,
        ids: [],
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };
      capture(zoneEl, event.pointerId);
      return;
    }

    let index = Number(target.closest<HTMLElement>('[data-card-index]')?.dataset.cardIndex ?? -1);
    if (zone.zone === 'waste') index = state.waste.length - 1;
    const cards = movingCards(state, zone, index);
    if (!cards?.[0]) {
      shake(target.closest('.card'));
      return;
    }
    if (pendingTap && pendingTap.id !== cards[0].id) {
      flushPending();
      return;
    }
    const handle = target.closest<HTMLElement>('.card') ?? zoneEl;
    gesture = {
      pointerId: event.pointerId,
      kind: 'card',
      from: zone,
      index,
      ids: cards.map((card) => card.id),
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    capture(handle, event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.pointerId || gesture.kind === 'stock') return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (Math.hypot(dx, dy) < 8) return;
      clearPending();
      startDrag(gesture);
    }
    const layer = document.getElementById('drag-layer');
    if (layer) layer.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function onPointerUp(event: PointerEvent): void {
    finishPointer(event, false);
  }

  function onPointerCancel(event: PointerEvent): void {
    finishPointer(event, true);
  }

  function finishPointer(event: PointerEvent, cancelled: boolean): void {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const current = gesture;
    gesture = null;
    if (current.dragging) {
      if (cancelled) snapBack();
      else finishDrag(current, event.clientX, event.clientY);
      return;
    }
    if (cancelled) return;
    if (current.kind === 'stock') {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 12) doDraw();
      return;
    }
    if (current.from) handleTap(current.from, current.index);
  }

  function startDrag(current: Gesture): void {
    current.dragging = true;
    const layer = document.getElementById('drag-layer');
    if (!layer || !current.from) return;
    layer.innerHTML = '';
    layer.style.transition = 'none';
    layer.style.transform = 'translate(0px, 0px)';
    for (const id of current.ids) {
      const el = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`);
      if (!el || el.closest('#drag-layer')) continue;
      const rect = el.getBoundingClientRect();
      el.classList.add('is-ghost');
      const clone = el.cloneNode(true) as HTMLElement;
      clone.classList.remove('is-ghost', 'deal', 'flip');
      clone.classList.add('is-dragging');
      clone.style.position = 'fixed';
      clone.style.margin = '0';
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      clone.style.pointerEvents = 'none';
      layer.appendChild(clone);
    }
    highlight(legalTargets(state, current.from, current.index));
  }

  function finishDrag(current: Gesture, x: number, y: number): void {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-zone]');
    const target = hit ? readZone(hit) : null;
    const legal = current.from ? legalTargets(state, current.from, current.index) : [];
    const allowed = target && legal.some((pile) => samePile(pile, target));
    if (!allowed || !target || !current.from) {
      snapBack();
      return;
    }
    const rects = captureRects();
    document.querySelectorAll<HTMLElement>('#drag-layer [data-card-id]').forEach((el) => {
      const id = el.dataset.cardId;
      if (id) rects.set(id, el.getBoundingClientRect());
    });
    clearDrag();
    doMove(current.from, current.index, target, rects);
  }

  function snapBack(): void {
    const layer = document.getElementById('drag-layer');
    if (!layer || reduceMotion) {
      clearDrag();
      return;
    }
    layer.style.transition = 'transform 160ms ease';
    layer.style.transform = 'translate(0px, 0px)';
    window.setTimeout(() => clearDrag(), 170);
  }

  function clearDrag(): void {
    const layer = document.getElementById('drag-layer');
    if (layer) {
      layer.innerHTML = '';
      layer.style.transform = '';
      layer.style.transition = '';
    }
    document.querySelectorAll('.is-ghost').forEach((el) => el.classList.remove('is-ghost'));
    document.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot'));
  }

  function highlight(targets: PileRef[]): void {
    document.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot'));
    for (const target of targets) {
      document
        .querySelector(`[data-zone="${target.zone}"][data-index="${target.index}"]`)
        ?.classList.add('is-hot');
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      closeOverlay();
      return;
    }
    if (overlayOpen) return;
    if ((event.key === 'z' || event.key === 'Z') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      doUndo();
    } else if (event.key === 'u' || event.key === 'U') {
      doUndo();
    } else if (event.key === 'n' || event.key === 'N') {
      void askNewGame();
    } else if (event.key === 'h' || event.key === 'H') {
      showHint();
    } else if (event.key === ' ') {
      event.preventDefault();
      doDraw();
    }
  }

  function newGame(drawCount: 1 | 3): void {
    cancelAuto();
    clearPending();
    clearDrag();
    if (recordStats) {
      stats = commitPendingWin(stats);
      rememberStats();
    }
    persistEnabled = true;
    recordStats = true;
    settings = { ...settings, drawCount };
    saveSettings(settings);
    state = createGame({ drawCount });
    seen.clear();
    seen.add(stateKey(state));
    elapsedMs = 0;
    winDismissed = false;
    suppressAuto = false;
    hudCache = '';
    persist();
    render({ dealing: true, flipped: new Set() });
    updateHud();
    liveEl!.textContent = 'Nytt spill er delt ut.';
    window.setTimeout(() => {
      document.querySelectorAll('.deal').forEach((el) => el.classList.remove('deal'));
    }, 900);
  }

  function restart(): void {
    cancelAuto();
    clearPending();
    clearDrag();
    if (recordStats) {
      stats = commitPendingWin(stats);
      rememberStats();
    }
    state = restartDeal({ ...state, elapsedMs });
    seen.clear();
    seen.add(stateKey(state));
    elapsedMs = 0;
    winDismissed = false;
    suppressAuto = true;
    hudCache = '';
    persist();
    render({ dealing: true, flipped: new Set() });
    updateHud();
    window.setTimeout(() => {
      document.querySelectorAll('.deal').forEach((el) => el.classList.remove('deal'));
    }, 900);
  }

  async function askNewGame(): Promise<void> {
    if (state.moves > 0 && !state.won) {
      const ok = await confirmDialog({
        title: 'Dele ut et nytt spill?',
        body: 'Dette spillet forsvinner. Spill du allerede har fullført, blir stående i statistikken.',
        confirm: 'Nytt spill',
      });
      if (!ok) return;
    }
    newGame(settings.drawCount);
  }

  async function askRestart(): Promise<void> {
    if (state.moves > 0 || state.won) {
      const ok = await confirmDialog({
        title: 'Starte denne kortgiven på nytt?',
        body: 'De samme kortene legges tilbake slik de lå i starten. Poeng og tid nullstilles.',
        confirm: 'Start på nytt',
      });
      if (!ok) return;
    }
    restart();
  }

  async function changeDraw(drawCount: 1 | 3): Promise<void> {
    if (drawCount === state.drawCount) return;
    if (state.moves > 0 && !state.won) {
      const ok = await confirmDialog({
        title: `Bytte til ${drawCount === 1 ? 'ett' : 'tre'} kort om gangen?`,
        body: 'Når du bytter, deles det ut et nytt spill.',
        confirm: 'Del ut',
      });
      if (!ok) {
        openMenu();
        return;
      }
    }
    newGame(drawCount);
  }

  function showHint(): void {
    if (overlayOpen || state.won || gesture?.dragging) return;
    cancelAuto();
    clearPending();
    const alreadyShowing = hintTimer !== null;
    clearHint();
    const hint = findHint(state, seen);
    if (hint.kind === 'none') {
      liveEl!.textContent = 'Ingen flere trekk.';
      openNoMoves();
      return;
    }
    // A hint costs points, but asking again for the one on screen does not.
    if (!alreadyShowing) {
      const charge = chargePenalty(state, elapsedMs);
      if (charge.charged > 0) {
        state = charge.state;
        persist();
        updateHud();
        showPenalty(charge.charged);
      }
    }
    if (hint.kind === 'draw') {
      document.querySelector('[data-zone="stock"]')?.classList.add('is-hint');
      const cardName = hint.card ? cardLabel(hint.card) : '';
      const times = hint.draws > 1 ? ` (${hint.draws} trekk)` : '';
      const text = hint.recycle
        ? `Snu bunken på nytt${cardName ? `: ${cardName} blir spillbar` : ''}`
        : cardName
          ? `Trekk fra bunken: ${cardName} blir spillbar${times}`
          : 'Trekk fra bunken';
      setStatus(text);
      liveEl!.textContent = `Hint: ${text}.`;
    } else {
      const cards = movingCards(state, hint.from, hint.index) ?? [];
      for (const card of cards) {
        document.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`)?.classList.add('is-hint');
      }
      document
        .querySelector(`[data-zone="${hint.to.zone}"][data-index="${hint.to.index}"]`)
        ?.classList.add('is-hint-target');
      const first = cards[0];
      liveEl!.textContent = first ? `Hint: flytt ${cardLabel(first)}.` : 'Hint vist.';
    }
    hintTimer = window.setTimeout(() => clearHint(), 3200);
  }

  function showPenalty(points: number): void {
    const host = scoreEl!.parentElement;
    if (!host) return;
    const pop = document.createElement('span');
    pop.className = 'penalty-pop';
    pop.textContent = `-${points}`;
    host.appendChild(pop);
    window.setTimeout(() => pop.remove(), 1000);
  }

  function openNoMoves(): void {
    showOverlay(`
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="nomoves-title">
        <h2 id="nomoves-title">Ingen flere trekk</h2>
        <p class="modal-copy">Jeg finner ingen flere nyttige trekk, heller ikke etter å ha bladd gjennom hele bunken. Prøv Angre, eller start et nytt spill.</p>
        <div class="modal-actions">
          <button type="button" class="btn primary" id="nomoves-new">Nytt spill</button>
          <button type="button" class="btn ghost" id="nomoves-close">Lukk</button>
        </div>
      </div>
    `, true);
    bind('nomoves-new', () => {
      closeOverlay();
      newGame(settings.drawCount);
    });
    bind('nomoves-close', () => closeOverlay());
    document.getElementById('nomoves-new')?.focus();
  }

  function clearHint(): void {
    if (hintTimer !== null) window.clearTimeout(hintTimer);
    hintTimer = null;
    document.querySelectorAll('.is-hint, .is-hint-target').forEach((el) => el.classList.remove('is-hint', 'is-hint-target'));
    if (autoTimer === null) setStatus('');
  }

  function openMenu(): void {
    cancelAuto();
    const parts = scoreParts(state.score, elapsedMs, state.won);
    const best = (mode: 1 | 3) => {
      const value = stats.bestMs[mode === 1 ? '1' : '3'];
      return value == null ? '—' : formatTime(value);
    };
    showOverlay(`
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <div class="grabber"></div>
        <header class="sheet-head">
          <div>
            <h2 id="menu-title">Valg</h2>
            <p class="sheet-sub">Solitaire · kortgiv ${dealLabel(state.seed)} · ${state.drawCount === 1 ? 'ett kort' : 'tre kort'}</p>
          </div>
          <button type="button" class="icon-btn" id="close-menu" aria-label="Lukk">${closeIcon()}</button>
        </header>
        <button type="button" class="row" id="menu-new">Nytt spill</button>
        <button type="button" class="row" id="menu-restart">Start denne kortgiven på nytt</button>
        <p class="section-label">Trekk fra bunken</p>
        <div class="segment" role="group" aria-label="Antall kort per trekk">
          <button type="button" id="draw-1" aria-pressed="${state.drawCount === 1}">Ett kort</button>
          <button type="button" id="draw-3" aria-pressed="${state.drawCount === 3}">Tre kort</button>
        </div>
        <p class="section-label">Spill</p>
        <button type="button" class="row switch-row" id="smart-tap" role="switch" aria-checked="${settings.smartTap}">
          <span class="switch-text">Smart trykk: send trygge kort opp<small>Trykk på et trygt kort sender det til grunnbunken</small></span>
          <span class="switch" aria-hidden="true"></span>
        </button>
        <p class="section-label">Utseende</p>
        <div class="segment" role="group" aria-label="Utseende">
          <button type="button" id="theme-felt" aria-pressed="${settings.theme === 'felt'}">Lys</button>
          <button type="button" id="theme-night" aria-pressed="${settings.theme === 'night'}">Mørk</button>
        </div>
        <p class="section-label">På denne enheten</p>
        <div class="stat-grid">
          <div><span>${stats.played}</span><small>Spilt</small></div>
          <div><span>${stats.won}</span><small>Vunnet</small></div>
          <div><span>${winRate(stats)}%</span><small>Vinnerandel</small></div>
          <div><span>${formatNumber(parts.total)}</span><small>Poeng nå</small></div>
          <div><span>${best(1)}</span><small>Best · ett kort</small></div>
          <div><span>${best(3)}</span><small>Best · tre kort</small></div>
        </div>
        <p class="section-label">Slik spiller du</p>
        <div class="rules">
          <p>Bygg hver grunnbunke fra ess til konge, én sort om gangen. Grunnbunkene ligger øverst til høyre: spar, hjerter, ruter, kløver.</p>
          <p>På bordet bygger du nedover med annenhver farge. En rad med åpne kort kan flyttes samlet. Bare en konge kan legges i en tom kolonne.</p>
          <p>Trykk på et kort for å flytte det. Med «Smart trykk» på sender trykket trygge kort rett til grunnbunken: ess og to-ere, og andre kort når begge kortene med motsatt farge og én lavere verdi allerede ligger der. Ellers går kortet til beste lovlige plass på bordet, og til grunnbunken hvis det ikke finnes noe annet. Ingenting flyttes av seg selv. Dobbelttrykk legger et kort på grunnbunken. Du kan også dra kortene. Trykk på bunken for å trekke. Når den er tom, trykker du igjen for å snu kastebunken. Med tre kort vises tre, men bare det øverste kan spilles.</p>
          <p>Hint ser på hele bordet og bunken og viser et nyttig trekk: å åpne et skjult kort, spille til grunnbunken eller tømme en kolonne. Hvis neste fremgang ligger i bunken, peker det på den og sier hvilket kort som blir spillbart. Når det ikke finnes flere trekk, får du beskjed. Hint og Angre koster 5 poeng hver (aldri under 0). Når alle kort ligger åpne og resten kan legges opp, fullfører spillet seg selv.</p>
          <p>Et kort på grunnbunken gir 10 poeng. Å spille fra kastebunken eller snu et kort gir 5. Å ta et kort ned fra grunnbunken koster 15. Å snu kastebunken koster 20 med tre kort og 100 med ett kort. To poeng forsvinner hvert tiende sekund. En seier gir 700 000 delt på antall sekunder i bonus.</p>
          <p>Angre er ubegrenset. Mellomrom trekker, N deler ut nytt spill og Ctrl eller Cmd Z angrer. Spillet lagres bare på denne enheten.</p>
        </div>
      </div>
    `);
    bind('close-menu', () => closeOverlay());
    bind('menu-new', () => {
      closeOverlay();
      void askNewGame();
    });
    bind('menu-restart', () => {
      closeOverlay();
      void askRestart();
    });
    bind('draw-1', () => {
      closeOverlay();
      void changeDraw(1);
    });
    bind('draw-3', () => {
      closeOverlay();
      void changeDraw(3);
    });
    bind('smart-tap', () => {
      settings = { ...settings, smartTap: !settings.smartTap };
      saveSettings(settings);
      document.getElementById('smart-tap')?.setAttribute('aria-checked', String(settings.smartTap));
    });
    bind('theme-felt', () => setTheme('felt'));
    bind('theme-night', () => setTheme('night'));
    document.getElementById('close-menu')?.focus();
  }

  function setTheme(theme: 'felt' | 'night'): void {
    settings = { ...settings, theme };
    saveSettings(settings);
    applyTheme(theme);
    document.getElementById('theme-felt')?.setAttribute('aria-pressed', String(theme === 'felt'));
    document.getElementById('theme-night')?.setAttribute('aria-pressed', String(theme === 'night'));
  }

  function openWin(): void {
    if (winDismissed || !state.won || document.querySelector('.win-dialog')) return;
    const parts = scoreParts(state.score, elapsedMs, true);
    const suits = SUITS.map((suit) => suitSvg(suit, 28, suit === 'h' || suit === 'd' ? '#ff3b30' : '#1c1c1e')).join('');
    showOverlay(`
      <div class="modal win-dialog" role="dialog" aria-modal="true" aria-labelledby="win-title">
        <p class="eyebrow">Solitaire</p>
        <h2 id="win-title">Godt spilt!</h2>
        <p class="modal-copy">Alle 52 kortene er lagt opp.</p>
        <div class="suit-row">${suits}</div>
        <p class="win-time">${formatTime(elapsedMs)}</p>
        <p class="win-score">${formatNumber(parts.total)}</p>
        <dl class="breakdown">
          <div><dt>Spill</dt><dd>${formatNumber(parts.play)}</dd></div>
          <div><dt>Tid</dt><dd>−${formatNumber(parts.timePenalty)}</dd></div>
          <div><dt>Bonus</dt><dd>${formatNumber(parts.bonus)}</dd></div>
        </dl>
        <div class="modal-actions">
          <button type="button" class="btn primary" id="win-new">Nytt spill</button>
          <button type="button" class="btn ghost" id="win-close">Behold bordet</button>
        </div>
      </div>
    `, true);
    burst();
    liveEl!.textContent = 'Du vant.';
    bind('win-new', () => {
      winDismissed = true;
      closeOverlay();
      newGame(settings.drawCount);
    });
    bind('win-close', () => {
      winDismissed = true;
      closeOverlay();
    });
    document.getElementById('win-new')?.focus();
  }

  function confirmDialog(copy: { title: string; body: string; confirm: string }): Promise<boolean> {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      showOverlay(`
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <h2 id="confirm-title">${copy.title}</h2>
          <p class="modal-copy">${copy.body}</p>
          <div class="modal-actions">
            <button type="button" class="btn primary" id="confirm-ok">${copy.confirm}</button>
            <button type="button" class="btn ghost" id="confirm-cancel">Avbryt</button>
          </div>
        </div>
      `, true);
      const settle = (value: boolean) => {
        const done = confirmResolve;
        confirmResolve = null;
        closeOverlay();
        done?.(value);
      };
      bind('confirm-ok', () => settle(true));
      bind('confirm-cancel', () => settle(false));
      document.getElementById('confirm-cancel')?.focus();
    });
  }

  function showOverlay(html: string, centered = false): void {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    overlay.classList.toggle('center', centered);
    overlay.innerHTML = `<div class="backdrop" data-backdrop="true"></div>${html}`;
    overlay.hidden = false;
    overlayOpen = true;
    overlay.querySelector('[data-backdrop]')?.addEventListener('click', () => closeOverlay());
  }

  function closeOverlay(): void {
    const overlay = document.getElementById('overlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.innerHTML = '';
    }
    overlayOpen = false;
    if (confirmResolve) {
      const done = confirmResolve;
      confirmResolve = null;
      done(false);
    }
  }

  function bind(id: string, handler: () => void): void {
    document.getElementById(id)?.addEventListener('click', handler);
  }

  function showInstallHint(): void {
    const nav = navigator as Navigator & { standalone?: boolean };
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    const show = shouldShowInstallHint({
      native: Capacitor.isNativePlatform(),
      iosBrowser: ios,
      standalone,
      dismissed: settings.installHintDismissed,
    });
    if (!show) return;
    hintEl!.hidden = false;
    hintEl!.innerHTML = `<p>For fullskjerm: trykk Del, og så Legg til på Hjem-skjerm.</p><button type="button" id="dismiss-hint" aria-label="Lukk">×</button>`;
    document.getElementById('dismiss-hint')?.addEventListener('click', () => {
      settings = { ...settings, installHintDismissed: true };
      saveSettings(settings);
      hintEl!.hidden = true;
    });
  }
}

function applyTheme(theme: 'felt' | 'night'): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#0b0d1a' : '#5b9cf6');
}

function readZone(el: HTMLElement): PileRef | null {
  const zone = el.dataset.zone;
  if (zone !== 'tableau' && zone !== 'foundation' && zone !== 'waste' && zone !== 'stock') return null;
  return { zone, index: Number(el.dataset.index ?? 0) };
}

function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // The pointer can vanish before capture on a quick tap.
  }
}

function dealLabel(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase();
}

function closeIcon(): string {
  return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
}

function burst(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.appendChild(canvas);
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const paint = context;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const colors = ['#7dd3fc', '#a78bfa', '#34d399', '#f472b6', '#ffffff', '#6366f1'];
  const pieces = Array.from({ length: 64 }, () => ({
    x: canvas.width * (0.15 + Math.random() * 0.7),
    y: -Math.random() * canvas.height * 0.4,
    w: (5 + Math.random() * 6) * dpr,
    h: (7 + Math.random() * 8) * dpr,
    vy: (2.2 + Math.random() * 3.2) * dpr,
    vx: (Math.random() - 0.5) * 1.6 * dpr,
    a: Math.random() * Math.PI,
    va: (Math.random() - 0.5) * 0.18,
    color: colors[Math.floor(Math.random() * colors.length)] ?? '#fff',
  }));
  let frame = 0;
  const tick = () => {
    frame += 1;
    paint.clearRect(0, 0, canvas.width, canvas.height);
    for (const piece of pieces) {
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.vy += 0.045 * dpr;
      piece.a += piece.va;
      paint.save();
      paint.translate(piece.x, piece.y);
      paint.rotate(piece.a);
      paint.fillStyle = piece.color;
      paint.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
      paint.restore();
    }
    if (frame < 150) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
