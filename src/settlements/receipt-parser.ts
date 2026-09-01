import type { OcrItem, OcrResult } from './ocr.service';

const TOTAL_KEYWORDS =
  /(총\s*금액|총액|합계|결제\s*금액|받을\s*금액|승인\s*금액|판매\s*합계|grand\s*total|total)/i;

const NON_ITEM_KEYWORDS =
  /(사업자|대표자|주소|전화|tel|영수증|receipt|주문번호|테이블|pos|승인|카드|거래|일시|날짜|공급가|부가세|과세|면세|세액|합계|총액|결제|받을금액|사용\s*금액|거스름|현금|신용|매출|봉사료|할인|포인트|잔액|보증금|total|수량\s*단가|품명\s*수량)/i;

const ITEM_SECTION_END =
  /(과세물품가액|면세물품가액|공급가액|부가세|세액|봉투보증금액|합계|총액|결제금액)/i;
const PRICE_PATTERN = /\d{1,3}(?:,\d{3})+|\d{3,}/g;

interface PendingItem {
  name: string;
  quantity: number;
}

function normalizeLine(line: string): string {
  return line.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toPrice(value: string): number {
  return Number.parseInt(value.replace(/[^\d]/g, ''), 10);
}

function pricesIn(line: string): Array<{ value: number; index: number }> {
  return [...line.matchAll(PRICE_PATTERN)]
    .map((match) => ({
      value: toPrice(match[0]),
      index: match.index ?? 0,
    }))
    .filter(({ value }) => Number.isFinite(value) && value > 0);
}

function findTotalPrice(lines: string[]): number | null {
  for (const line of [...lines].reverse()) {
    if (!TOTAL_KEYWORDS.test(line)) {
      continue;
    }

    const prices = pricesIn(line);
    if (prices.length > 0) {
      return prices.at(-1)?.value ?? null;
    }
  }

  // 일부 영수증은 합계 문구와 금액이 서로 다른 줄로 인식된다.
  for (const line of [...lines].reverse()) {
    if (!/[₩￦]/.test(line)) {
      continue;
    }

    const prices = pricesIn(line);
    if (prices.length > 0) {
      return prices.at(-1)?.value ?? null;
    }
  }

  return null;
}

function findStoreName(lines: string[]): string | null {
  const branchName = lines
    .slice(0, 12)
    .find((line) => /점\s*#?\d{3,}$/i.test(line));
  if (branchName) {
    return branchName.replace(/\s*#?\d{3,}\s*$/, '').trim();
  }

  for (const line of lines.slice(0, 12)) {
    const hasLetters = /[가-힣A-Za-z]/.test(line);
    const looksLikeMetadata =
      NON_ITEM_KEYWORDS.test(line) ||
      /\d{2,4}[-./]\d{1,2}[-./]\d{1,2}/.test(line) ||
      /\d{2,4}-\d{3,4}-\d{4}/.test(line);

    if (hasLetters && !looksLikeMetadata && line.length <= 50) {
      return line;
    }
  }

  return null;
}

function cleanProductName(name: string): string {
  return name
    .replace(/^\d{1,3}\s+/, '')
    .replace(/\s*\d{2,4}\s*(?:ml|g|kg|l)?\s*$/i, '')
    .replace(/[-:]+$/, '')
    .trim();
}

function parseInlineItem(line: string): OcrItem | null {
  if (NON_ITEM_KEYWORDS.test(line)) {
    return null;
  }

  const prices = pricesIn(line);
  if (prices.length === 0) {
    return null;
  }

  const firstPrice = prices[0];
  let nameAndQuantity = line.slice(0, firstPrice.index).trim();
  if (!/[가-힣A-Za-z]/.test(nameAndQuantity)) {
    return null;
  }

  let quantity = 1;
  const explicitQuantity = nameAndQuantity.match(
    /(?:^|\s)(\d{1,2})\s*(?:개|ea|x|×|\*)\s*$/i,
  );
  const columnQuantity = nameAndQuantity.match(/(?:^|\s)(\d{1,2})\s*$/);
  const quantityMatch = explicitQuantity ?? columnQuantity;

  if (quantityMatch) {
    quantity = Number.parseInt(quantityMatch[1], 10) || 1;
    nameAndQuantity = nameAndQuantity.slice(0, quantityMatch.index).trim();
  }

  const name = cleanProductName(nameAndQuantity);
  if (!name || name.length > 80) {
    return null;
  }

  const price =
    quantity > 1 && prices.length > 1
      ? prices[prices.length - 2].value
      : prices[prices.length - 1].value;

  return { name, price, quantity };
}

function findItemHeaderIndex(lines: string[]): number {
  return lines.findIndex(
    (line) =>
      /^(상품명|품명)$/i.test(line) ||
      (/상품명|품명/i.test(line) && /금액|가격/i.test(line)),
  );
}

function isBarcode(line: string): boolean {
  return /^\*?\d{8,14}$/.test(line.replace(/\s/g, ''));
}

function isStandaloneNumber(line: string): boolean {
  return /^[₩￦]?\s*\d[\d,]*\s*원?$/.test(line);
}

function repairMergedQuantityAndPrice(
  rawLine: string,
  value: number,
  totalPrice: number | null,
  currentSubtotal: number,
): { price: number; quantity: number | null } {
  if (!totalPrice || currentSubtotal + value <= totalPrice) {
    return { price: value, quantity: null };
  }

  // OCR이 서로 다른 열의 "1  6,900"을 "16,900"으로 붙여 읽는 경우를 보정한다.
  const digits = rawLine.replace(/[^\d]/g, '');
  const candidates: Array<{
    price: number;
    quantity: number;
    calculatedSubtotal: number;
  }> = [];

  for (let prefixLength = 1; prefixLength <= 2; prefixLength += 1) {
    if (digits.length - prefixLength < 3) {
      continue;
    }

    const quantity = Number.parseInt(digits.slice(0, prefixLength), 10);
    const price = Number.parseInt(digits.slice(prefixLength), 10);
    const calculatedSubtotal = currentSubtotal + quantity * price;

    if (
      quantity >= 1 &&
      quantity <= 20 &&
      price >= 100 &&
      calculatedSubtotal <= totalPrice
    ) {
      candidates.push({ price, quantity, calculatedSubtotal });
    }
  }

  const best = candidates.sort(
    (a, b) => b.calculatedSubtotal - a.calculatedSubtotal,
  )[0];
  return best
    ? { price: best.price, quantity: best.quantity }
    : { price: value, quantity: null };
}

function parseMultilineItems(
  lines: string[],
  headerIndex: number,
  totalPrice: number | null,
): OcrItem[] {
  const items: OcrItem[] = [];
  let pending: PendingItem | null = null;

  const subtotal = () =>
    items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  for (const line of lines.slice(headerIndex + 1)) {
    if (ITEM_SECTION_END.test(line)) {
      break;
    }
    if (
      /^(상품명|품명|수량|금액|가격|단가|행사|증정)$/i.test(line) ||
      isBarcode(line)
    ) {
      continue;
    }
    if (/보증금/i.test(line)) {
      break;
    }

    if (isStandaloneNumber(line)) {
      if (!pending) {
        continue;
      }

      const value = toPrice(line);
      const hasPriceMarker = /[,₩￦원]/.test(line);
      if (!hasPriceMarker && value >= 1 && value <= 20) {
        pending.quantity = value;
        continue;
      }

      const repaired = repairMergedQuantityAndPrice(
        line,
        value,
        totalPrice,
        subtotal(),
      );
      if (repaired.quantity) {
        pending.quantity = repaired.quantity;
      }
      items.push({
        name: pending.name,
        price: repaired.price,
        quantity: pending.quantity,
      });
      pending = null;
      continue;
    }

    const inlineItem = parseInlineItem(line);
    if (inlineItem && /\s(?:₩|￦)?\d[\d,]*\s*원?$/.test(line)) {
      if (pending) {
        pending = null;
      }
      items.push(inlineItem);
      continue;
    }

    if (/[가-힣A-Za-z]/.test(line) && !NON_ITEM_KEYWORDS.test(line)) {
      pending = {
        name: cleanProductName(line),
        quantity: 1,
      };
    }
  }

  return items.filter((item) => item.name && item.price > 0);
}

export function parseReceiptText(
  text: string,
  coordinateLines?: string[],
): OcrResult {
  const rawLines = coordinateLines?.length
    ? coordinateLines
    : text.split(/\r?\n/);
  const lines = rawLines.map(normalizeLine).filter(Boolean);

  const storeName = findStoreName(lines);
  const totalPrice = findTotalPrice(lines);
  const headerIndex = findItemHeaderIndex(lines);
  const items =
    headerIndex >= 0
      ? parseMultilineItems(lines, headerIndex, totalPrice)
      : lines
          .map(parseInlineItem)
          .filter((item): item is OcrItem => item !== null)
          .filter((item) => !totalPrice || item.price <= totalPrice);

  return { storeName, items, totalPrice };
}
