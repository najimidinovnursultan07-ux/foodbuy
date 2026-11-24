import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { join } from 'node:path';

const FONTS = join(__dirname, '..', '..', 'assets', 'fonts');

export interface QrCard {
  label: string;
  url: string;
}

/**
 * A4, 6 карточек на лист (2×3) с линиями отреза: название ресторана, «Стол N», QR и подсказка на трёх языках.
 * Шрифт DejaVu Sans — с кириллицей и кыргызскими ң, ө, ү.
 */
export async function renderQrPdf(restaurantName: string, cards: QrCard[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `QR — ${restaurantName}` } });
  doc.registerFont('regular', join(FONTS, 'DejaVuSans.ttf'));
  doc.registerFont('bold', join(FONTS, 'DejaVuSans-Bold.ttf'));
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = 595.28;
  const H = 841.89;
  const cols = 2;
  const rows = 3;
  const cw = W / cols;
  const ch = H / rows;
  const qrSize = 150;

  for (let i = 0; i < cards.length; i++) {
    const pos = i % (cols * rows);
    if (i > 0 && pos === 0) doc.addPage();
    if (pos === 0) {
      // линии отреза
      doc.save().dash(3, { space: 4 }).lineWidth(0.5).strokeColor('#a8a29e');
      for (let c = 1; c < cols; c++) doc.moveTo(c * cw, 0).lineTo(c * cw, H).stroke();
      for (let r = 1; r < rows; r++) doc.moveTo(0, r * ch).lineTo(W, r * ch).stroke();
      doc.restore();
    }
    const card = cards[i]!;
    const x = (pos % cols) * cw;
    const y = Math.floor(pos / cols) * ch;
    const png = await QRCode.toBuffer(card.url, { errorCorrectionLevel: 'M', margin: 1, width: 600 });

    doc.fillColor('#1c1917').font('bold').fontSize(13).text(restaurantName, x + 16, y + 18, { width: cw - 32, align: 'center' });
    doc.font('bold').fontSize(26).text(`Стол ${card.label}`, x + 16, y + 38, { width: cw - 32, align: 'center' });
    doc.image(png, x + (cw - qrSize) / 2, y + 76, { width: qrSize, height: qrSize });
    doc
      .font('regular')
      .fontSize(9)
      .fillColor('#44403c')
      .text('Меню и заказ — наведите камеру\nМеню жана заказ — камераны багыттаңыз\nMenu & order — point your camera', x + 16, y + 234, {
        width: cw - 32,
        align: 'center',
        lineGap: 1,
      });
  }
  doc.end();
  return done;
}
