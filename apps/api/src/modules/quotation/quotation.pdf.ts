import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { CURRENCY_DECIMALS, type Money, type Quote } from "../../schemas";

/**
 * The quotation PDF (Day 11), laid out like the developer's reference
 * (refs/seller quotation .pdf, 21 Nov 2026): A4; "Quotation" title with
 * number and dates; Muhrak logo top right; From / To boxes; blue item table
 * (header repeated on each page, every other row tinted); shipping, VAT and
 * total; terms and conditions; additional notes; a dashed footer with the
 * number, date, buyer and "Page x of y" on every page.
 *
 * Measurements and colours were taken from the reference PDF itself.
 * Drawing only: every value comes from a saved quotation (the API's own
 * numbers); nothing here decides anything. No email or phone of the buyer
 * or the seller: the contact lines are Muhrak's (developer decision).
 */

/** Muhrak's contact details, as on the reference quotation. */
export const MUHRAK_CONTACT = { email: "info@muhrak.com", phone: "+968 799 833 13" } as const;

const asset = (path: string) => fileURLToPath(new URL(`../../../assets/${path}`, import.meta.url));
const FONTS = {
  regular: asset("fonts/OpenSans-Regular.ttf"),
  semibold: asset("fonts/OpenSans-SemiBold.ttf"),
  bold: asset("fonts/OpenSans-Bold.ttf"),
};
const LOGO = asset("muhrak-logo.png");

// Colours from the reference.
const BLUE = "#2544AF";
const NAVY = "#201742";
const INK = "#161C26";
const BODY = "#3E4550";
const MUTED = "#7F8FA4";
/** The reference tints boxes and rows with the blue at 20% opacity. */
const TINT_OPACITY = 0.2;

// A4 in points and the reference's margins.
const PAGE = { width: 595.28, height: 841.89 };
const LEFT = 28.5;
const RIGHT = 569.5;
const CONTENT_BOTTOM = 770;
const FOOTER_TOP = 791;

// Table columns (reference: # | Item | Quantity | Rate | Amount).
const COL = { num: LEFT, item: 62, qty: 299, rate: 374, amount: 472, end: RIGHT };
const HEADER_H = 25;
/** One-line row height and text inset, measured on the reference. */
const ROW_H = 25;
const ROW_PAD = 5.9;
const LINE_H = 20.7;
const TEXT = 9.45;

const STATUS_STAMP: Partial<Record<Quote["status"], string>> = {
  withdrawn: "WITHDRAWN",
  superseded: "REPLACED BY A NEWER QUOTE",
  expired: "EXPIRED",
};

function muscatDate(iso: string, style: "header" | "footer"): string {
  const date = new Date(iso);
  return style === "header"
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Muscat" }).format(date)
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Muscat" }).format(date);
}

/** "OMR 2,219.474", as in the reference (integer arithmetic only). */
export function pdfMoney(money: Money): string {
  const decimals = CURRENCY_DECIMALS[money.currency];
  const base = 10 ** decimals;
  const whole = Math.floor(money.amountMinor / base).toLocaleString("en-US");
  const fraction = String(money.amountMinor % base).padStart(decimals, "0");
  return `${money.currency} ${whole}.${fraction}`;
}

type Doc = PDFKit.PDFDocument;

/** Split text into lines that fit `width` with the current font (long words are cut). */
function wrap(doc: Doc, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (doc.widthOfString(candidate) <= width) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // A word wider than the column: cut it.
      let rest = word;
      while (doc.widthOfString(rest) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && doc.widthOfString(rest.slice(0, cut)) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    lines.push(current);
  }
  return lines;
}

function tint(doc: Doc, x: number, y: number, w: number, h: number, radius = 0) {
  doc.save().fillOpacity(TINT_OPACITY).fillColor(BLUE);
  if (radius) doc.roundedRect(x, y, w, h, radius).fill();
  else doc.rect(x, y, w, h).fill();
  doc.restore();
}

function tableHeader(doc: Doc, y: number): number {
  doc.save().fillColor(BLUE).roundedRect(LEFT, y, RIGHT - LEFT, HEADER_H, 3).fill().restore();
  doc.font("bold").fontSize(TEXT).fillColor("#FFFFFF");
  const ty = y + (HEADER_H - TEXT * 1.36) / 2;
  doc.text("Item", COL.item + 6, ty, { lineBreak: false });
  doc.text("Quantity", COL.qty, ty, { width: COL.rate - COL.qty, align: "center", lineBreak: false });
  doc.text("Rate", COL.rate, ty, { width: COL.amount - COL.rate, align: "center", lineBreak: false });
  doc.text("Amount", COL.amount, ty, { width: COL.end - COL.amount, align: "center", lineBreak: false });
  return y + HEADER_H;
}

export async function renderQuotePdf(quote: Quote): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    bufferPages: true,
    info: {
      Title: `Quotation ${quote.reference}`,
      Author: quote.seller.companyName,
      Subject: `Quotation ${quote.reference} for ${quote.rfqReference}`,
      Creator: "Muhrak",
      Producer: "Muhrak",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.registerFont("regular", FONTS.regular);
  doc.registerFont("semibold", FONTS.semibold);
  doc.registerFont("bold", FONTS.bold);

  // ------------------------------------------------------------ title block
  doc.font("regular").fontSize(21.6).fillColor(BLUE).text("Quotation", LEFT + 1, 30, { lineBreak: false });
  const stamp = STATUS_STAMP[quote.status];
  if (stamp) {
    doc.font("bold").fontSize(8.5);
    const w = doc.widthOfString(stamp) + 14;
    doc.save().lineWidth(1.2).strokeColor("#B42318").roundedRect(140, 36, w, 18, 3).stroke().restore();
    doc.fillColor("#B42318").text(stamp, 147, 40.5, { lineBreak: false });
  }

  const meta: [string, string][] = [
    ["Quotation No #", quote.reference],
    ["Quotation Date", muscatDate(quote.createdAt, "header")],
    ["Valid Till Date", muscatDate(quote.validUntil, "header")],
  ];
  meta.forEach(([label, value], index) => {
    const y = 67 + index * 21.4;
    doc.font("semibold").fontSize(TEXT).fillColor(MUTED).text(label, LEFT + 1.5, y, { lineBreak: false });
    doc.font("bold").fontSize(TEXT).fillColor(NAVY).text(value, 114, y, { lineBreak: false });
  });

  doc.image(LOGO, 453, 28, { width: 117 });

  // ------------------------------------------------------------ From / To
  const boxTop = 142.5;
  const boxH = 126.5;
  const boxW = 266.5;
  const boxes: { x: number; title: string; lines: { label?: string; text: string; bold?: boolean }[] }[] = [
    {
      x: LEFT,
      title: "From",
      lines: [
        { text: quote.seller.companyName, bold: true },
        { text: [quote.seller.city, quote.seller.countryName].filter(Boolean).join(", ") },
        { label: "Email:", text: MUHRAK_CONTACT.email },
        { label: "Phone:", text: MUHRAK_CONTACT.phone },
      ],
    },
    {
      x: 303,
      title: "To",
      lines: [
        { text: quote.buyer.name, bold: true },
        { label: "Deliver to:", text: `${quote.buyer.deliveryCity}, ${quote.buyer.deliveryCountryName}` },
        { label: "Request:", text: quote.rfqReference },
      ],
    },
  ];
  for (const box of boxes) {
    tint(doc, box.x, boxTop, boxW, boxH, 5);
    doc.font("regular").fontSize(14.2).fillColor(BLUE).text(box.title, box.x + 10.5, boxTop + 8, { lineBreak: false });
    let y = boxTop + 35;
    for (const line of box.lines) {
      const inner = boxW - 21;
      doc.fontSize(TEXT);
      if (line.label) {
        doc.font("bold").fillColor(INK);
        const labelWidth = doc.widthOfString(`${line.label} `);
        doc.text(`${line.label} `, box.x + 10.5, y, { lineBreak: false });
        doc.font("regular").fillColor(INK).text(line.text, box.x + 10.5 + labelWidth, y, { width: inner - labelWidth, height: 14.3, ellipsis: true, lineBreak: false });
      } else {
        doc.font(line.bold ? "bold" : "regular").fillColor(INK).text(line.text, box.x + 10.5, y, { width: inner, height: 14.3, ellipsis: true, lineBreak: false });
      }
      y += 14.3;
    }
  }

  // ------------------------------------------------------------ items
  let y = tableHeader(doc, 282);
  const newPage = () => {
    doc.addPage({ size: "A4", margin: 0 });
    y = tableHeader(doc, 22);
  };

  quote.items.forEach((item, index) => {
    doc.font("regular").fontSize(TEXT);
    const itemWidth = COL.qty - COL.item - 14;
    const lines = [
      ...wrap(doc, item.partNumber ? `${item.partNumber} ${item.description}` : item.description, itemWidth),
      ...(item.details ? wrap(doc, item.details, itemWidth) : []),
    ];
    const tinted = index % 2 === 0;
    let first = true;
    let remaining = lines;
    while (remaining.length > 0) {
      // Lines that still fit on this page (row height = ROW_H + LINE_H per extra line).
      const room = Math.floor((CONTENT_BOTTOM - y - ROW_H) / LINE_H) + 1;
      // As in the reference, a long item continues on the next page; never leave a lone first line behind.
      if (room < 1 || (first && room < Math.min(2, remaining.length))) {
        newPage();
        continue;
      }
      const part = remaining.slice(0, room);
      remaining = remaining.slice(room);
      const h = ROW_H + (part.length - 1) * LINE_H;
      if (tinted) {
        tint(doc, LEFT, y, RIGHT - LEFT, h);
        doc.save().lineWidth(0.6).strokeOpacity(0.25).strokeColor(BLUE);
        doc.moveTo(COL.qty, y).lineTo(COL.qty, y + h).stroke();
        doc.moveTo(COL.rate, y).lineTo(COL.rate, y + (first ? ROW_H : 0)).stroke();
        doc.moveTo(COL.item, y).lineTo(COL.item, y + h).stroke();
        doc.restore();
      }
      const ty = y + ROW_PAD;
      doc.font("regular").fontSize(TEXT).fillColor(BODY);
      if (first) {
        doc.text(`${item.position}.`, COL.num + 5.5, ty, { lineBreak: false });
        doc.text(item.quantity.toLocaleString("en-US"), COL.qty, ty, { width: COL.rate - COL.qty, align: "center", lineBreak: false });
        doc.text(pdfMoney(item.unitPrice), COL.rate, ty, { width: COL.amount - COL.rate, align: "center", lineBreak: false });
        doc.text(pdfMoney(item.amount), COL.amount, ty, { width: COL.end - COL.amount, align: "center", lineBreak: false });
      }
      part.forEach((text, i) => doc.text(text, COL.item + 6, ty + i * LINE_H, { lineBreak: false }));
      y += h;
      first = false;
      if (remaining.length > 0) newPage();
    }
  });

  // ------------------------------------------------------------ totals
  const ensure = (height: number) => {
    if (y + height > CONTENT_BOTTOM) {
      doc.addPage({ size: "A4", margin: 0 });
      y = 30;
    }
  };
  ensure(120);
  y += 8;
  const labelX = 354;
  const valueRight = 558;
  const totalRow = (label: string, value: string) => {
    doc.font("regular").fontSize(TEXT).fillColor(BODY).text(label, labelX, y, { lineBreak: false });
    doc.text(value, labelX, y, { width: valueRight - labelX, align: "right", lineBreak: false });
    y += 25.5;
  };
  totalRow("Shipping Costs", quote.shipping.amountMinor === 0 ? "Free" : pdfMoney(quote.shipping));
  totalRow(quote.vatRateBp > 0 ? `VAT (${quote.vatRateBp / 100}%)` : "VAT", quote.vatRateBp > 0 ? pdfMoney(quote.vat) : "Not charged");
  // Two navy rules around the total, split between label and value (as in the reference).
  const rule = (ry: number) => {
    doc.save().lineWidth(1.4).strokeColor(NAVY);
    doc.moveTo(labelX, ry).lineTo(448.5, ry).stroke();
    doc.moveTo(450.5, ry).lineTo(RIGHT, ry).stroke();
    doc.restore();
  };
  rule(y - 6);
  doc.font("bold").fontSize(14.2).fillColor(NAVY).text(`Total (${quote.total.currency})`, labelX, y, { lineBreak: false });
  doc.text(pdfMoney(quote.total), 450.5, y, { width: valueRight - 450.5, align: "right", lineBreak: false });
  y += 25;
  rule(y);
  y += 30;

  // ------------------------------------------------------------ terms and notes
  const section = (title: string, paragraphs: string[], numbered: boolean) => {
    ensure(50);
    doc.font("regular").fontSize(12.6).fillColor(BLUE).text(title, LEFT + 1, y, { lineBreak: false });
    y += 22;
    doc.font("regular").fontSize(TEXT).fillColor(INK);
    paragraphs.forEach((paragraph, index) => {
      const prefix = numbered ? `${index + 1}. ` : "";
      const indent = numbered ? LEFT + 9 : LEFT + 1;
      const prefixWidth = numbered ? doc.widthOfString(prefix) : 0;
      const lines = wrap(doc, paragraph, RIGHT - indent - prefixWidth);
      lines.forEach((text, i) => {
        ensure(15);
        if (i === 0 && numbered) doc.text(prefix, indent, y, { lineBreak: false });
        doc.text(text, indent + prefixWidth, y, { lineBreak: false });
        y += 14.3;
      });
      if (!numbered) y += 6;
    });
    y += 14;
  };

  const terms = [
    `Validity of this quotation is (${quote.validDays}) days from date of issuance.`,
    "100% advance payment through Muhrak. The order starts once Muhrak confirms the payment. Payments made outside Muhrak are not protected.",
    `Delivery within (${quote.deliveryDays}) days after payment, to ${quote.buyer.deliveryCity}, ${quote.buyer.deliveryCountryName}.`,
    quote.vatRateBp > 0
      ? `VAT ${quote.vatRateBp / 100}% is charged on the items and shipping and is included in the total.`
      : "The seller is not VAT registered; no VAT is charged.",
    ...(quote.terms ? quote.terms.split("\n").map((line) => line.trim()).filter(Boolean) : []),
  ];
  section("Terms and Conditions", terms, true);
  if (quote.notes) section("Additional Notes", quote.notes.split("\n").map((line) => line.trim()).filter(Boolean), false);

  // ------------------------------------------------------------ footer on every page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.save().lineWidth(0.75).dash(3, { space: 2 }).strokeColor(MUTED).moveTo(19, FOOTER_TOP).lineTo(577, FOOTER_TOP).stroke().undash().restore();
    const cols: [number, string, string][] = [
      [22.7, "Quotation No", quote.reference],
      [112, "Quotation Date", muscatDate(quote.createdAt, "footer")],
      [193, "To", quote.buyer.name],
    ];
    for (const [x, label, value] of cols) {
      doc.font("Courier").fontSize(5.6).fillColor(MUTED).text(label, x, 800, { lineBreak: false });
      doc.font("Courier").fontSize(7).fillColor(BODY).text(value, x, 810, { width: x === 193 ? 250 : 85, height: 9, ellipsis: true, lineBreak: false });
    }
    doc.font("Courier").fontSize(7).fillColor(BODY).text(`Page ${i + 1} of ${range.count}`, 470, 800, { width: 101, align: "right", lineBreak: false });
    doc
      .font("Courier")
      .fontSize(5.6)
      .fillColor(BODY)
      .text("This is an electronically generated document, no signature is required.", 0, 827, { width: PAGE.width, align: "center", lineBreak: false });
  }

  doc.end();
  return done;
}
