import type { OcrItem, OcrResult } from './ocr.service';

type JapaneseReceiptResult = Pick<
  OcrResult,
  'storeName' | 'items' | 'totalPrice'
>;
const NUMBER = '(?:\\d{1,3}(?:\\s*,\\s*\\d{3})+|\\d+)';
const AMOUNT_END = new RegExp(
  `(?:¥\\s*)?(${NUMBER})\\s*(?:円)?\\s*[※*外内軽税込]*$`,
);
const TOTAL_LABEL =
  /^(?:合計|現計|総合計|お買上(?:げ)?合計|お支払(?:い)?(?:金額|合計)|ご請求(?:金額|額)|ご利用金額)/;
const METADATA =
  /^(?:小計|税込小計|合計|現計|総合計|お買上|お支払|ご請求|ご利用|税|内税|外税|内消費税|消費税|対象|お預[りか]|預[りか]|お釣[り銭]|おつり|釣[り銭]|現金|クレジット|カード|領収|レシート|レジ|登録|電話|点数|取引|売上|承認|決済|金券|クーポン|値引|割引|ポイント|今回|累計|残高|会員|担当|責任者|営業時間|管理者|住所|TEL|No[.:]|https?:|www\.)/i;
const SUMMARY_END =
  /^(?:小計|税込小計|合計|現計|総合計|お買上(?:げ)?合計|お支払|ご請求|ご利用|\(?\d+%|税|内税|外税|内消費税|消費税|対象|現金|クレジット|カード|金券|クーポン|ポイント)/;

function normalize(line: string): string {
  return line
    .normalize('NFKC')
    .replace(/\\(?=\s*\d)/g, '¥')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(line: string): string {
  return line.replace(/\s/g, '').replace(/^[<【[(※*◆●]+/, '');
}

function integer(value: string): number | null {
  if (!new RegExp(`^${NUMBER}$`).test(value)) return null;
  const number = Number(value.replace(/[\s,]/g, ''));
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function amountAtEnd(line: string): { amount: number; prefix: string } | null {
  const match = AMOUNT_END.exec(line);
  if (!match || match.index === undefined) return null;
  const before = line.slice(0, match.index);
  if (/[\d.,]$/.test(before) || /[+−-]$/.test(before.trimEnd())) return null;
  const amount = integer(match[1]);
  return amount === null ? null : { amount, prefix: before.trim() };
}

function findTotal(lines: string[]): number | null {
  let total: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (!TOTAL_LABEL.test(compact(lines[index]))) continue;
    if (/^合計(?:点数|数量|個数|税額)/.test(compact(lines[index]))) continue;
    const inline = amountAtEnd(lines[index]);
    const following = lines[index + 1];
    const next =
      following && /^[¥\d]/.test(following) ? amountAtEnd(following) : null;
    if (inline && !/\d/.test(inline.prefix.replace(/\d+\s*(?:点|個|コ)/g, '')))
      total = inline.amount;
    else if (next && !next.prefix) total = next.amount;
  }
  return total;
}

function cleanName(
  name: string,
  hasDepartmentCodes: boolean,
  hasTaxMarkers: boolean,
): string {
  if (hasDepartmentCodes) name = name.replace(/^\d{2}(?:\s*[*※]\s*|\s+)/, '');
  if (hasTaxMarkers) name = name.replace(/^(?:内|外)\s+/, '');
  return name
    .replace(/^(?:内|外)\s*[*※]+\s*/, '')
    .replace(/^[*※◆●]+\s*/, '')
    .trim();
}

function productName(name: string): boolean {
  return (
    !!name &&
    name.length <= 100 &&
    /\p{L}/u.test(name) &&
    !METADATA.test(compact(name)) &&
    !/\d{2,4}[年/.-]\d{1,2}[月/.-]\d{1,2}/.test(name)
  );
}

function quantityLine(
  line: string,
): { quantity: number; unitPrice: number; totalPrice: number | null } | null {
  const value = line.replace(/\s/g, '').replace(/^[([]|[)\]]$/g, '');
  const totalSuffix = `(?:¥(${NUMBER})(?:円)?[※*外内軽税込]*)?`;
  const priceFirst = new RegExp(
    `^@(${NUMBER})[x×X]([1-9]\\d*)(?:個|コ|点)?${totalSuffix}$`,
  ).exec(value);
  const countFirst = new RegExp(
    `^([1-9]\\d*)(?:(?:個|コ|点)[x×X](?:単|@)?|[x×X](?:単|@))(${NUMBER})${totalSuffix}$`,
  ).exec(value);
  if (!priceFirst && !countFirst) return null;
  const quantity = Number(priceFirst?.[2] ?? countFirst![1]);
  const unitPrice = integer(priceFirst?.[1] ?? countFirst![2]);
  return Number.isSafeInteger(quantity) && quantity > 0 && unitPrice !== null
    ? {
        quantity,
        unitPrice,
        totalPrice: integer(priceFirst?.[3] ?? countFirst?.[3] ?? ''),
      }
    : null;
}

function parseItems(lines: string[]): OcrItem[] {
  const items: OcrItem[] = [];
  let pendingName: string | null = null;
  let previousItem: number | null = null;
  const hasDepartmentCodes =
    lines.filter((line) => /^\d{2}\s*[*※]/.test(line)).length >= 2;
  const hasTaxMarkers = lines.some((line) => /^(?:内|外)\s*[*※]/.test(line));
  for (const line of lines) {
    const quantity = quantityLine(line);
    if (quantity) {
      if (pendingName && quantity.totalPrice !== null) {
        const name = cleanName(pendingName, hasDepartmentCodes, hasTaxMarkers);
        if (
          productName(name) &&
          quantity.quantity * quantity.unitPrice === quantity.totalPrice
        ) {
          items.push({
            name,
            price: quantity.unitPrice,
            quantity: quantity.quantity,
          });
        }
      } else if (previousItem !== null) {
        const item = items[previousItem];
        if (
          quantity.quantity * quantity.unitPrice ===
          item.price * item.quantity
        ) {
          item.quantity = quantity.quantity;
          item.price = quantity.unitPrice;
        } else {
          // 明示された数量と金額が矛盾する行は推測しない。
          items.splice(previousItem, 1);
        }
      }
      pendingName = null;
      previousItem = null;
      continue;
    }
    const label = compact(line);
    if (SUMMARY_END.test(label) && items.length) break;
    if (METADATA.test(label) || /^\(?\d+%/.test(label)) {
      pendingName = null;
      previousItem = null;
      continue;
    }
    const parsed = amountAtEnd(line);
    if (parsed) {
      const hasCurrency = /¥|円/.test(line);
      if (!hasCurrency) {
        pendingName = productName(line) ? line : null;
        previousItem = null;
        continue;
      }
      const name = cleanName(
        parsed.prefix || pendingName || '',
        hasDepartmentCodes,
        hasTaxMarkers,
      );
      if (productName(name)) {
        items.push({ name, price: parsed.amount, quantity: 1 });
        previousItem = items.length - 1;
      } else previousItem = null;
      pendingName = null;
    } else {
      pendingName = productName(line) ? line : null;
      previousItem = null;
    }
  }
  return items;
}

export function parseJapaneseReceiptText(
  text: string,
  coordinateLines?: string[],
): JapaneseReceiptResult {
  const textLines = text.split(/\r?\n/).map(normalize).filter(Boolean);
  const lines = coordinateLines?.length
    ? coordinateLines.map(normalize).filter(Boolean)
    : textLines;
  const items = parseItems(lines);
  return {
    storeName:
      lines
        .slice(0, 12)
        .map((line) => line.replace(/\s*TEL[:\s\d].*$/i, '').trim())
        .find((line) => /店$/.test(line) && !METADATA.test(compact(line))) ??
      lines.slice(0, 12).find(productName) ??
      null,
    items,
    totalPrice: findTotal(textLines) ?? findTotal(lines),
  };
}
