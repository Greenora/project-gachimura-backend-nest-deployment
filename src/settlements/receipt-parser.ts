import type { OcrItem, OcrResult } from './ocr.service';

const TOTAL_KEYWORDS =
  /^(실결제금액|청구금액|총합계액|총합계|총금액|총액|합계|주문합계|주문금액|결제(?:대상)?(?:금액|액)|결제(?=[:₩￦\d]|$)|받을금액|받은금액|승인금액|판매합계|grandtotal|total)/i;
const NON_ITEM_KEYWORDS =
  /^(사업자|대표자?|주소|영수증|receipt|주문번호|테이블|승인|거래|판매일시|일시|날짜|공급가|부가(?:가치)?세|과세|면세|세액|합계|총액|결제|받을금액|사용금액|거스름|현금|신용|매출|봉사료|잔액|보증금|직원|계산원|판매원|취급자|점원|담당자?|고객번호|회원번호|가맹점|교환|환불|total|grandtotal|전화(?:번호|[:\d(])|tel(?:[:\d(])|pos(?:[:\d])|카드(?:번호|결제|승인|종류|사|[:\d*])|할인(?:금액|액|[:\d-])|포인트(?:적립|사용|잔액|[:\d]))/i;
const ITEM_SECTION_END =
  /^(과세|면세|공급가액|부가(?:가치)?세|세액|봉투보증금액|합계|총액|총금액|결제|받을금액|승인금액|현금|신용|카드(?:결제|번호|승인|매출)|grandtotal|total)/i;
const PRICE_PATTERN =
  /(?<![\d.,+-])(?:[₩￦]\s*)?(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d+)(?:\s*원)?(?![\d.,])/g;

type ItemColumn = 'quantity' | 'unitPrice' | 'amount' | 'discount';
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
    /^(?:총할인(?:액|금액)?|행사할인|할인액|금액(?=[:₩￦\d]|$))/.test(
      label(line),
    ) ||
    /^계(?=[:₩￦\d]|$)/.test(label(line)) ||
    /\d{2,4}[-./]\d{1,2}[-./]\d{1,2}/.test(line) ||
    /\d{2,4}-\d{3,4}-\d{4}/.test(line)
  );
}

function findExplicitTotalPrice(lines: string[]): number | null {
  let best: { price: number; priority: number } | null = null;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!TOTAL_KEYWORDS.test(label(line))) continue;
    const priority = /^(실결제|청구|결제)/.test(label(line))
      ? 3
      : /^(받을|받은)/.test(label(line))
        ? 2
        : 1;
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
      if (
        Number.isSafeInteger(price) &&
        price > 0 &&
        (!best || priority > best.priority)
      )
        best = { price, priority };
    }
    if (prices.length) continue;
    const next = lines[index + 1];
    if (next) {
      const values = numberValues(next);
      if (values?.length === 1 && !/(개|ea)$/i.test(values[0])) {
        const price = toPrice(values[0]);
        if (
          Number.isSafeInteger(price) &&
          price > 0 &&
          (!best || priority > best.priority)
        )
          best = { price, priority };
      }
    }
  }
  return best?.price ?? null;
}

function signedAmounts(line: string): number[] {
  return [
    ...line.matchAll(
      /(?<![\d.,])[-−]?(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d+)(?![\d.,])/g,
    ),
  ]
    .filter(
      (match) =>
        !/^\s*(?:%|개|점|명|년|월|일|시|분|초|ea\b)/i.test(
          line.slice((match.index ?? 0) + match[0].length),
        ),
    )
    .map(([value]) => Number(value.replace(/[,.]/g, '').replace('−', '-')))
    .filter(Number.isSafeInteger);
}

function namedAmount(lines: string[], pattern: RegExp): number | null {
  const values = lines
    .flatMap((line, index) => {
      const namedLine = line.replace(/^\s*\d{1,3}[.)]\s*/, '');
      if (!pattern.test(label(namedLine))) return [];
      const amounts = signedAmounts(namedLine);
      if (amounts.length) return [amounts];
      const next = lines[index + 1];
      return next && /^[-−]?[\d,.]+(?:원)?$/.test(label(next))
        ? [signedAmounts(next)]
        : [];
    })
    .filter((values) => values.length === 1)
    .map((values) => Math.abs(values[0]));
  return values.length && new Set(values).size === 1 ? values[0] : null;
}

function finalPaymentTotal(
  lines: string[],
  total: number | null,
): number | null {
  const gross = namedAmount(lines, /^(?:총합계액|총합계|상품합계)/);
  const discount = namedAmount(lines, /^총할인(?:액|금액)?(?=[:₩￦\d−-]|$)/);
  if (
    gross !== null &&
    discount !== null &&
    discount > 0 &&
    gross > discount &&
    (total === null || total === gross)
  )
    return gross - discount;
  const partnerDiscount = namedAmount(
    lines,
    /^제휴(?:카드)?할인(?:금액|액)?(?=[:₩￦\d−-]|$)/,
  );
  if (total === null || partnerDiscount === null || partnerDiscount <= 0)
    return total;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!/^결제수단별(?:결제)?내역/.test(label(lines[index]))) continue;
    const paymentLines: string[] = [];
    for (const line of lines.slice(index + 1)) {
      if (
        /^(?:할인내역|할인정보|적립|포인트|신용매출|카드번호|승인번호)/.test(
          label(line),
        )
      )
        break;
      paymentLines.push(line);
    }
    const paid = namedAmount(
      paymentLines,
      /^(?:신용카드|체크카드|현금|간편결제)(?=[:₩￦\d]|$)/,
    );
    if (paid !== null && paid + partnerDiscount === total) return paid;
  }
  return total;
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
  name = name.replace(/^[*＊+]+\s*/, '');
  // 번호 열 또는 연속된 01·02 행이 확인된 경우에만 숫자 접두어를 지운다.
  if (hasItemIndex) name = name.replace(/^\d{1,3}(?:\s*[*＊]+\s*|\s+)/, '');
  return name
    .replace(/^\d{8,14}\s+/, '')
    .replace(/[-:]+$/, '')
    .trim();
}

function itemHeader(line: string): boolean {
  const compact = label(line).replace(/[•·:,[\]()/\\-]/g, '');
  return /^(?:(?:번호|순번|no\.?))?(?:상품명|상품|품명|품목명|물품명|제품명|메뉴명|메뉴)(?:상품코드|코드)?(?:수량|단가|할인금액|할인|금액|가격)*$/i.test(
    compact,
  );
}

function findColumns(lines: string[], headerIndex: number): ItemColumn[] {
  if (headerIndex < 0) return [];
  // 별도 열인 '할인 금액'을 공백 제거로 '할인금액' 한 열로 합치지 않는다.
  const columnLabels = (line: string) =>
    label(line.replace(/할인\s+금액/g, '할인;금액'));
  let header = columnLabels(lines[headerIndex]);
  for (const line of lines.slice(headerIndex + 1)) {
    if (!/^(수량|단가|할인금액|할인|금액|가격)+$/.test(label(line))) break;
    header += `;${columnLabels(line)}`;
  }
  return [...header.matchAll(/할인금액|할인|수량|단가|금액|가격/g)].map(
    ([column]) =>
      column === '수량'
        ? 'quantity'
        : column === '단가' || column === '가격'
          ? 'unitPrice'
          : column.startsWith('할인')
            ? 'discount'
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
  // 수량·금액 제목 앞의 누락된 단가 열은 행 산술이 정확할 때만 인정한다.
  if (
    columns[0] === 'quantity' &&
    !columns.includes('unitPrice') &&
    columns.includes('amount') &&
    numbers.length === columns.length + 1
  ) {
    const quantity = numbers[1];
    const amount = numbers[columns.indexOf('amount') + 1];
    const discount = columns.includes('discount')
      ? numbers[columns.indexOf('discount') + 1]
      : 0;
    if (numbers[0] * quantity - discount === amount)
      columns = ['unitPrice', ...columns];
  }
  if (
    numbers.some(
      (value, index) =>
        !Number.isSafeInteger(value) ||
        (columns[index] === 'discount' ? value < 0 : value <= 0),
    )
  )
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

function withoutBarcode(line: string): string {
  return line.replace(
    /^(?:[$*＊]\s*)+\d{6,14}(?:\s+|$)|^\d{8,14}(?:\s+|$)/,
    '',
  );
}

function applyItemDiscount(
  items: OcrItem[],
  line: string,
  discounted: Set<OcrItem>,
): boolean {
  const numbers = signedAmounts(line);
  const previous = items.at(-1);
  if (
    /할인/.test(label(line)) &&
    numbers.length === 2 &&
    previous &&
    !discounted.has(previous)
  ) {
    const net = numbers.find(
      (value, index) =>
        value > 0 &&
        Math.abs(numbers[1 - index]) > 0 &&
        previous.price * previous.quantity - Math.abs(numbers[1 - index]) ===
          value,
    );
    if (net !== undefined && net % previous.quantity === 0) {
      previous.price = net / previous.quantity;
      discounted.add(previous);
      return true;
    }
  }
  const match = line.match(/^(.*?)\s+[-−](\d{1,3}(?:,\d{3})+|\d+)\s*원?$/);
  if (!match) return false;
  const name = label(match[1]).replace(/할인|[()[\]-]/g, '');
  const matched = items.filter(
    (item) => label(item.name).replace(/할인|[()[\]-]/g, '') === name,
  );
  if (matched.length !== 1) return false;
  if (discounted.has(matched[0])) return true;
  const item = matched[0];
  const net = item.price * item.quantity - toPrice(match[2]);
  if (net <= 0 || net % item.quantity !== 0) return false;
  item.price = net / item.quantity;
  discounted.add(item);
  return true;
}

function parseItems(lines: string[], headerIndex: number): OcrItem[] {
  const items: OcrItem[] = [];
  const columns = findColumns(lines, headerIndex);
  const hasItemIndex =
    headerIndex >= 0 &&
    (/^(번호|순번|no\.?)/i.test(label(lines[headerIndex])) ||
      hasSequentialIndexes(lines.slice(headerIndex + 1)));
  let pending: PendingItem | null = null;
  const discounted = new Set<OcrItem>();
  const rows = lines.slice(headerIndex + 1);
  const hasBundledMenu =
    headerIndex < 0 && rows.some((line) => /^>>\s*[가-힣A-Za-z]/.test(line));
  for (const [index, line] of rows.entries()) {
    const compact = label(line);
    if (applyItemDiscount(items, line, discounted)) continue;
    // 적용 근거가 부족한 할인 행도 다음 상품명의 일부로 붙이지 않는다.
    if (/할인/.test(compact) && /[-−]\s*\d/.test(line)) {
      pending = null;
      continue;
    }
    if (
      ITEM_SECTION_END.test(compact) ||
      TOTAL_KEYWORDS.test(compact) ||
      /^계(?=[:₩￦\d]|$)/.test(compact)
    ) {
      if (headerIndex >= 0 || items.length > 0) break;
      continue;
    }
    if (
      /^(?:(?:상품명|상품|품명|품목명)|(?:수량|금액|가격|단가|할인금액|할인|행사|증정)+)$/.test(
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
    const previous = items.at(-1);
    if (
      previous &&
      previous.name.lastIndexOf('(') > previous.name.lastIndexOf(')') &&
      /^[가-힣A-Za-z\s]+\)$/.test(line)
    ) {
      previous.name += ` ${line}`;
      pending = null;
      continue;
    }
    const values = numberValues(columns.length ? withoutBarcode(line) : line);
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
    if (
      !row &&
      (/^(?:ㄴ|[-−]\s*[▶▷])/.test(line) || /^-.*\(\s*0\s*\)$/.test(line))
    ) {
      pending = null;
      continue;
    }
    const nextValues =
      rows[index + 1] && numberValues(withoutBarcode(rows[index + 1]));
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
      const name =
        pending && pending.values.length === 0
          ? `${pending.name} ${row.name}`
          : row.name;
      // 상위(*)·하위(>>) 옵션이 함께 인쇄된 POS의 상위 행에만 두 열을 적용한다.
      const rowColumns: ItemColumn[] =
        hasBundledMenu && /^\*/.test(line) && row.values.length === 2
          ? ['quantity', 'amount']
          : columns;
      const item = makeItem(name, row.values, rowColumns, hasItemIndex);
      if (item) items.push(item);
      pending =
        !item && headerIndex >= 0 && row.values.length < columns.length
          ? row
          : null;
      continue;
    }
    if (headerIndex >= 0 && /[가-힣A-Za-z]/.test(line))
      pending = {
        name:
          pending && pending.values.length === 0
            ? `${pending.name} ${line}`
            : line,
        values: [],
      };
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
  const items = parseItems(lines, headerIndex);
  const allLines = [...textLines, ...lines];
  const totalPrice = finalPaymentTotal(
    allLines,
    findExplicitTotalPrice(textLines) ?? findTotalPrice(lines),
  );
  if (items.length === 1 && totalPrice !== null) {
    const discount = namedAmount(
      allLines,
      /^총할인(?:액|금액)?(?=[:₩￦\d−-]|$)/,
    );
    const item = items[0];
    if (
      discount !== null &&
      discount > 0 &&
      item.price * item.quantity - discount === totalPrice &&
      totalPrice % item.quantity === 0
    )
      item.price = totalPrice / item.quantity;
  }
  return {
    storeName: findStoreName(lines),
    items,
    // 휘어진 영수증에서 좌표 행이 어긋나도 원문의 명시된 결제 금액을 우선한다.
    totalPrice,
  };
}
