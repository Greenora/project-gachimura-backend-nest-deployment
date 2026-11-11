import type { OcrItem, OcrResult } from './ocr.service';

const TOTAL_KEYWORDS =
  /^(총금액|총액|합계|주문합계|결제(?:대상)?금액|받을금액|승인금액|판매합계|grandtotal|total)/i;
const NON_ITEM_KEYWORDS =
  /^(사업자|대표자?|주소|영수증|receipt|주문번호|테이블|승인|거래|판매일시|일시|날짜|공급가|부가(?:가치)?세|과세|면세|세액|합계|총액|결제|받을금액|사용금액|거스름|현금|신용|매출|봉사료|잔액|보증금|직원|계산원|판매원|취급자|점원|담당자?|고객번호|회원번호|가맹점|교환|환불|total|grandtotal|전화(?:번호|[:\d(])|tel(?:[:\d(])|pos(?:[:\d])|카드(?:번호|결제|승인|종류|사|[:\d*])|할인(?:금액|액|[:\d-])|포인트(?:적립|사용|잔액|[:\d]))/i;
const ITEM_SECTION_END =
  /^(과세|면세|공급가액|부가(?:가치)?세|세액|봉투보증금액|합계|총액|총금액|결제|받을금액|승인금액|현금|신용|카드(?:결제|번호|승인|매출)|grandtotal|total)/i;
const PRICE_PATTERN =
  /(?<![\d.,+-])(?:[₩￦]\s*)?(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d+)(?:\s*원)?(?![\d.,])/g;

type ItemColumn = 'quantity' | 'unitPrice' | 'amount';
interface PendingItem {
  name: string;
  values: string[];
}

function normalizeLine(line: string): string {
  return line.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
}

// OCR이 한글 라벨 사이에 넣은 공백은 판별할 때만 제거한다.
function label(line: string): string {
  return line.replace(/\s/g, '').replace(/^[*＊[\]():-]+/, '');
}

function toPrice(value: string): number {
  return Number.parseInt(value.replace(/[^\d]/g, ''), 10);
}

function isMetadata(line: string): boolean {
  return (
    TOTAL_KEYWORDS.test(label(line)) ||
    NON_ITEM_KEYWORDS.test(label(line)) ||
    /^계(?=[:₩￦\d]|$)/.test(label(line)) ||
    /\d{2,4}[-./]\d{1,2}[-./]\d{1,2}/.test(line) ||
    /\d{2,4}-\d{3,4}-\d{4}/.test(line)
  );
}

function findExplicitTotalPrice(lines: string[]): number | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!TOTAL_KEYWORDS.test(label(line))) continue;
    if (/[+−-]\s*\d/.test(line)) continue;
    const prices = [...line.matchAll(PRICE_PATTERN)].filter(
      (match) =>
        !/^\s*(?:%|개|점|명|년|월|일|시|분|초|ea\b)/i.test(
          line.slice((match.index ?? 0) + match[0].length),
        ),
    );
    const currencyPrices = prices.filter(([value]) => /[₩￦원]/.test(value));
    // 수량·적립률과 구분된 금액 한 개만 사용하며 복수 금액은 추측하지 않는다.
    const candidates = currencyPrices.length
      ? currencyPrices
      : prices.length === 1
        ? prices
        : prices.filter(([value]) => toPrice(value) >= 100);
    if (candidates.length === 1) {
      const price = toPrice(candidates[0][0]);
      if (Number.isSafeInteger(price) && price > 0) return price;
    }
    if (prices.length) continue;
    const next = lines[index + 1];
    if (next) {
      const values = numberValues(next);
      if (values?.length === 1 && !/(개|ea)$/i.test(values[0])) {
        const price = toPrice(values[0]);
        if (Number.isSafeInteger(price) && price > 0) return price;
      }
    }
  }
  return null;
}

function findTotalPrice(lines: string[]): number | null {
  const explicit = findExplicitTotalPrice(lines);
  if (explicit !== null) return explicit;
  for (const line of [...lines].reverse()) {
    if (!/^[₩￦]/.test(line) || numberValues(line)?.length !== 1) continue;
    const price = toPrice(line);
    if (Number.isSafeInteger(price) && price > 0) return price;
  }
  return null;
}

function findStoreName(lines: string[]): string | null {
  const branchName = lines
    .slice(0, 12)
    .find((line) => /점\s*#?\d{3,}$/i.test(line));
  if (branchName) return branchName.replace(/\s*#?\d{3,}\s*$/, '').trim();
  return (
    lines
      .slice(0, 12)
      .find(
        (line) =>
          /[가-힣A-Za-z]/.test(line) && !isMetadata(line) && line.length <= 50,
      ) ?? null
  );
}

function cleanProductName(name: string, hasItemIndex: boolean): string {
  name = name.replace(/^[*＊]+\s*/, '');
  // 번호 열 또는 연속된 01·02 행이 확인된 경우에만 숫자 접두어를 지운다.
  if (hasItemIndex) name = name.replace(/^\d{1,3}(?:\s*[*＊]+\s*|\s+)/, '');
  return name
    .replace(/^\d{8,14}\s+/, '')
    .replace(/[-:]+$/, '')
    .trim();
}

function itemHeader(line: string): boolean {
  const compact = label(line).replace(/[•·:,[\]()/\\-]/g, '');
  return /^(?:(?:번호|순번|no\.?))?(?:상품명|상품|품명|품목명|물품명)(?:수량|단가|금액|가격)*$/i.test(
    compact,
  );
}

function findColumns(lines: string[], headerIndex: number): ItemColumn[] {
  if (headerIndex < 0) return [];
  let header = label(lines[headerIndex]);
  for (const line of lines.slice(headerIndex + 1)) {
    if (!/^(수량|단가|금액|가격)+$/.test(label(line))) break;
    header += label(line);
  }
  return [...header.matchAll(/수량|단가|금액|가격/g)].map(([column]) =>
    column === '수량'
      ? 'quantity'
      : column === '단가' || column === '가격'
        ? 'unitPrice'
        : 'amount',
  );
}

function hasSequentialIndexes(lines: string[]): boolean {
  const indexes: number[] = [];
  for (const line of lines) {
    if (ITEM_SECTION_END.test(label(line)) || TOTAL_KEYWORDS.test(label(line)))
      break;
    const index = line
      .replace(/^[*＊]+\s*/, '')
      .match(/^(0\d{1,2})(?:\s*[*＊]+\s*|\s+)(?=[가-힣A-Za-z(])/);
    if (index) indexes.push(Number(index[1]));
  }
  return (
    indexes.length >= 2 && indexes.every((value, index) => value === index + 1)
  );
}

function numberValues(line: string): string[] | null {
  const normalized = line
    .replace(/([₩￦])\s+/g, '$1')
    .replace(/(\d)\s+(원|개|ea)(?=\s|$)/gi, '$1$2');
  const values = normalized.split(/\s+/);
  return values.every((value) =>
    /^[₩￦]?(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d+)(?:원|개|ea)?$/i.test(
      value,
    ),
  )
    ? values
    : null;
}

function makeItem(
  name: string,
  values: string[],
  columns: ItemColumn[],
  hasItemIndex: boolean,
): OcrItem | null {
  name = cleanProductName(name, hasItemIndex);
  if (
    !name ||
    name.length > 80 ||
    !/[가-힣A-Za-z]/.test(name) ||
    isMetadata(name)
  )
    return null;
  const numbers = values.map(toPrice);
  if (numbers.some((value) => !Number.isSafeInteger(value) || value <= 0))
    return null;
  let quantity = 1;
  let price: number;
  let amount: number | undefined;

  if (columns.length) {
    if (
      columns.length !== numbers.length ||
      new Set(columns).size !== columns.length ||
      columns.some((column, index) =>
        column === 'quantity'
          ? /[₩￦원]/.test(values[index])
          : /(?:개|ea)$/i.test(values[index]),
      )
    )
      return null;
    const fields = Object.fromEntries(
      columns.map((column, index) => [column, numbers[index]]),
    );
    quantity = fields.quantity ?? 1;
    amount = fields.amount;
    // 정산에는 표시 단가보다 실제 청구된 행 금액을 사용한다(할인 포함).
    if (amount !== undefined) {
      if (amount % quantity !== 0) return null;
      price = amount / quantity;
    } else if (fields.unitPrice !== undefined) price = fields.unitPrice;
    else return null;
  } else if (numbers.length === 1 && !/(개|ea)$/i.test(values[0])) {
    // 표 제목 없는 경우 짧은 번호·직원번호·바코드를 금액으로 취급하지 않는다.
    if (
      /^0\d/.test(values[0]) ||
      /^\d{8,14}$/.test(values[0]) ||
      (numbers[0] < 100 && !/[₩￦원,]/.test(values[0]))
    )
      return null;
    price = numbers[0];
  } else if (numbers.length === 3 && /(?:개|ea)$/i.test(values[0])) {
    if (
      /[₩￦원]/.test(values[0]) ||
      values.slice(1).some((value) => /(?:개|ea)$/i.test(value))
    )
      return null;
    [quantity, price, amount] = numbers;
  } else if (numbers.length === 3) {
    // 표 제목이 없을 때도 단가×명시 수량=행 금액인 경우에만 열 순서를 인정한다.
    const [unitPrice, count, lineAmount] = numbers;
    if (
      /[₩￦원]/.test(values[1]) ||
      values.some((value) => /(?:개|ea)$/i.test(value)) ||
      unitPrice * count !== lineAmount
    )
      return null;
    price = unitPrice;
    quantity = count;
    amount = lineAmount;
  } else return null;

  const extended = price * quantity;
  if (
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    !Number.isSafeInteger(extended) ||
    (amount !== undefined && amount !== extended)
  )
    return null;
  const promotionPrice = name.match(/^\(\s*(\d{1,3}(?:,\d{3})+|\d+)\s*\)\s*/);
  if (promotionPrice && toPrice(promotionPrice[1]) === price) {
    name = name.slice(promotionPrice[0].length).trim();
  }
  return { name, price, quantity };
}

function splitItem(line: string): PendingItem | null {
  if (isMetadata(line)) return null;
  const parts = line.split(' ');
  for (let index = 1; index < parts.length; index += 1) {
    const values = numberValues(parts.slice(index).join(' '));
    if (values) return { name: parts.slice(0, index).join(' '), values };
  }
  return null;
}

function parseItems(lines: string[], headerIndex: number): OcrItem[] {
  const items: OcrItem[] = [];
  const columns = findColumns(lines, headerIndex);
  const hasItemIndex =
    headerIndex >= 0 &&
    (/^(번호|순번|no\.?)/i.test(label(lines[headerIndex])) ||
      hasSequentialIndexes(lines.slice(headerIndex + 1)));
  let pending: PendingItem | null = null;
  const rows = lines.slice(headerIndex + 1);
  for (const [index, line] of rows.entries()) {
    const compact = label(line);
    if (
      ITEM_SECTION_END.test(compact) ||
      TOTAL_KEYWORDS.test(compact) ||
      /^계(?=[:₩￦\d]|$)/.test(compact)
    ) {
      if (headerIndex >= 0 || items.length > 0) break;
      continue;
    }
    if (
      /^(상품명|상품|품명|품목명|수량|금액|가격|단가|행사|증정)$/.test(
        compact,
      ) ||
      /^\*?\d{8,14}$/.test(compact)
    )
      continue;
    if (/보증금/.test(compact)) break;
    if (isMetadata(line)) {
      pending = null;
      continue;
    }
    const values = numberValues(
      columns.length ? line.replace(/^[*＊]?\d{8,14}\s+/, '') : line,
    );
    if (values && pending) {
      pending.values.push(...values);
      const item = makeItem(
        pending.name,
        pending.values,
        columns,
        hasItemIndex,
      );
      if (item) {
        items.push(item);
        pending = null;
      } else if (pending.values.length >= columns.length) pending = null;
      continue;
    }
    const row = splitItem(line);
    const nextValues =
      rows[index + 1] &&
      numberValues(rows[index + 1].replace(/^[*＊]?\d{8,14}\s+/, ''));
    if (
      columns.length &&
      /[가-힣A-Za-z]/.test(line) &&
      nextValues?.length === columns.length &&
      (!row || !makeItem(row.name, row.values, columns, hasItemIndex))
    ) {
      pending = { name: line, values: [] };
      continue;
    }
    if (row) {
      const item = makeItem(row.name, row.values, columns, hasItemIndex);
      if (item) items.push(item);
      pending =
        !item && headerIndex >= 0 && row.values.length < columns.length
          ? row
          : null;
      continue;
    }
    if (headerIndex >= 0 && /[가-힣A-Za-z]/.test(line))
      pending = { name: line, values: [] };
  }
  return items;
}

export function parseReceiptText(
  text: string,
  coordinateLines?: string[],
): OcrResult {
  const textLines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const lines = coordinateLines?.length
    ? coordinateLines.map(normalizeLine).filter(Boolean)
    : textLines;
  const headerIndex = lines.findIndex(itemHeader);
  return {
    storeName: findStoreName(lines),
    items: parseItems(lines, headerIndex),
    // 휘어진 영수증에서 좌표 행이 어긋나도 원문의 명시된 결제 금액을 우선한다.
    totalPrice: findExplicitTotalPrice(textLines) ?? findTotalPrice(lines),
  };
}
