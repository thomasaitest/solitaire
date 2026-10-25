import type { GameState } from '../game/types.ts';
import { SUITS } from '../game/types.ts';
import { cardBackSvg, cardFaceSvg, cardLabel, recycleSvg, suitSvg } from './cards.ts';
import type { Layout } from './layout.ts';

export interface RenderOptions {
  dealing: boolean;
  flipped: Set<string>;
  reduce: boolean;
}

function cardButton(
  card: GameState['tableau'][number][number],
  index: number,
  style: string,
  extraClass: string,
  extraAttr: string,
): string {
  const face = card.faceUp ? cardFaceSvg(card) : cardBackSvg();
  return `<button type="button" class="card${card.faceUp ? '' : ' back'}${extraClass}" data-card-id="${card.id}" data-card-index="${index}" style="${style}" aria-label="${cardLabel(card)}" draggable="false"${extraAttr}>${face}</button>`;
}

export function renderTable(table: HTMLElement, state: GameState, layout: Layout, options: RenderOptions): void {
  const dealClass = options.dealing && !options.reduce ? ' deal' : '';
  let dealOrder = 0;

  const stockInner = state.stock.length
    ? `<button type="button" class="card back" id="stock-btn" aria-label="Draw from the stock, ${state.stock.length} remaining" draggable="false">${cardBackSvg()}<span class="count">${state.stock.length}</span></button>`
    : state.waste.length
      ? `<button type="button" class="slot recycle" id="stock-btn" aria-label="Turn the waste into the stock">${recycleSvg()}</button>`
      : `<div class="slot" id="stock-btn" aria-hidden="true"></div>`;

  const fanCount = state.drawCount === 1 ? 1 : 3;
  const visibleWaste = state.waste.slice(-fanCount);
  const wasteCards = visibleWaste
    .map((card, index) => {
      const realIndex = state.waste.length - visibleWaste.length + index;
      const top = index === visibleWaste.length - 1;
      const hidden = top ? '' : ' aria-hidden="true" tabindex="-1"';
      const inert = top ? '' : 'pointer-events:none;';
      return cardButton(
        card,
        realIndex,
        `left:${index * layout.fan}px;z-index:${index + 1};${inert}`,
        '',
        hidden,
      );
    })
    .join('');

  const foundations = SUITS.map((suit, index) => {
    const pile = state.foundations[index] ?? [];
    const top = pile[pile.length - 1];
    const card = top
      ? cardButton(top, pile.length - 1, '', '', '')
      : '';
    const name = suit === 's' ? 'spades' : suit === 'h' ? 'hearts' : suit === 'd' ? 'diamonds' : 'clubs';
    return `<div class="foundation${top ? ' has-card' : ''}" data-zone="foundation" data-index="${index}" aria-label="${top ? '' : `Empty ${name} foundation`}">
      <div class="slot" aria-hidden="true"><span class="watermark">${suitSvg(suit, Math.round(layout.cardW * 0.42))}</span></div>
      ${card}
    </div>`;
  }).join('');

  const columns = state.tableau
    .map((pile, pileIndex) => {
      if (pile.length === 0) {
        return `<div class="column" data-zone="tableau" data-index="${pileIndex}"><div class="slot" aria-hidden="true"></div></div>`;
      }
      const cards = pile
        .map((card, index) => {
          const previous = pile[index - 1];
          const peek = previous ? (previous.faceUp ? layout.upPeek : layout.downPeek) : 0;
          const margin = index === 0 ? 0 : -(layout.cardH - peek);
          const delay = options.dealing && !options.reduce ? `animation-delay:${dealOrder * 16}ms;` : '';
          dealOrder += 1;
          const flipped = options.flipped.has(card.id) && !options.reduce ? ' flip' : '';
          return cardButton(
            card,
            index,
            `margin-top:${margin}px;z-index:${index + 1};${delay}`,
            `${dealClass}${flipped}`,
            '',
          );
        })
        .join('');
      return `<div class="column" data-zone="tableau" data-index="${pileIndex}">${cards}</div>`;
    })
    .join('');

  table.innerHTML = `
    <div class="top-row">
      <div class="stock-waste">
        <div class="stock" data-zone="stock" data-index="0">${stockInner}</div>
        <div class="waste" data-zone="waste" data-index="0">
          <div class="slot" aria-hidden="true"></div>
          ${wasteCards}
        </div>
      </div>
      <div class="foundations">${foundations}</div>
    </div>
    <div class="tableau">${columns}</div>
  `;
}
