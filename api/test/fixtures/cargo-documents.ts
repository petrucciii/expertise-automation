import ExcelJS from 'exceljs';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

// All names, quantities, identifiers, and events below are synthetic test data.
export const sectorExamples = {
  seaWaybill: [
    'SEA WAYBILL SWB-TEST-014',
    'Shipper: Adriatic Produce Test Ltd',
    'Consignee: Nordic Food Test Ltd',
    'Vessel: M/V Test Horizon',
    'Origin: Trieste; Destination: Gdansk',
    'Container TEST000001: 1080 cartons on 29 pallets.',
    'Container TEST000002: 894 cartons on 34 pallets.',
    'Commodity: frozen boneless beef. Gross weight: 24500 kg.',
    'Issued 2026-09-01. Expected arrival 2026-09-07.',
  ],
  warehouseTally: [
    'WAREHOUSE RECEIPT WR-TEST-022',
    'Received 24 wrapped pallets on 2026-09-08.',
    'This tally covers only the first warehouse delivery lot.',
    'Expected units are recorded in cartons. Carton count not verified.',
  ],
  roadSurvey: [
    'ROAD TRANSPORT SURVEY TEST-031',
    'Vehicle: TEST-TRUCK-01. CMR: CMR-TEST-010.',
    'During the survey on 2026-09-09, the surveyor observed five wet cartons.',
    'No conclusion is made about the time or cause of water ingress.',
    'Original photographs and the signed handover note have not been provided.',
  ],
  airClaim: [
    'AIR CARGO CLAIM AWB-TEST-456',
    'Commodity: pharmaceutical goods. Planned transport: Milan to Warsaw.',
    'The consignee claims EUR 12500. This is a claimed amount, not an assessed loss.',
    'The actual delivery time and custody handover remain unverified.',
  ],
  railShortage: [
    'RAIL CONSIGNMENT TEST-RAIL-008',
    'Loading list records 100 bags, each nominally 25 kg.',
    'Destination count records 98 bags. The weighing ticket states net weight 2450 kg.',
    'The gross weight on the transport document is 2600 kg.',
    'Net and gross weights must not be compared as the same measurement.',
  ],
};

export async function cargoDocx(lines: string[]): Promise<Buffer> {
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          children: lines.map(
            (line, index) =>
              new Paragraph({
                text: line,
                ...(index === 0 ? { heading: HeadingLevel.TITLE } : {}),
              }),
          ),
        },
      ],
    }),
  );
}

/** Legible synthetic label for browser OCR tests; it contains no real shipment data. */
export async function cargoLabelImage(
  format: 'png' | 'jpeg' | 'tiff',
): Promise<Buffer> {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900"><rect width="1400" height="900" fill="white"/><g fill="black" font-family="Arial" font-size="52"><text x="60" y="110">SYNTHETIC CARGO LABEL</text><text x="60" y="220">Container TEST000003</text><text x="60" y="330">24 cartons on 2 pallets</text><text x="60" y="440">Inspection date 2026-09-08</text><text x="60" y="550">Seal TESTSEAL001</text><text x="60" y="660">Cause not verified</text></g></svg>',
  );
  return sharp(svg).toFormat(format).toBuffer();
}

/** A small independent PDF writer keeps parser tests independent of the parser under test. */
export function cargoPdf(lines: string[]): Buffer {
  const text = lines
    .map(
      (line) =>
        `(${line.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')}) Tj T*`,
    )
    .join('\n');
  const stream = `BT /F1 12 Tf 40 790 Td 18 TL\n${text}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let result = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(result);
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const crossReference = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReference}\n%%EOF\n`;
  return Buffer.from(result);
}

export async function temperatureWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.subject = `Synthetic reefer data ${randomUUID()}`;
  const sheet = workbook.addWorksheet('Reefer TEST000001');
  sheet.addRows([
    ['Timestamp UTC', 'Temperature C'],
    ['2026-09-05T00:00:00Z', -18],
    ['2026-09-05T01:00:00Z', -17.5],
    ['2026-09-05T02:00:00Z', -10],
    ['2026-09-05T03:00:00Z', -4.5],
    ['2026-09-05T04:00:00Z', 'sensor offline'],
    ['2026-09-05T05:00:00Z', { formula: 'AVERAGE(B2:B5)', result: -12.5 }],
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const claimEmail = [
  'From: consignee@example.test',
  'To: surveyor@example.test',
  'Cc: insurer@example.test',
  'Date: Tue, 08 Sep 2026 12:30:00 +0200',
  'Message-ID: <cargo-claim-test-1@example.test>',
  'Subject: =?UTF-8?Q?Reclamo_merce_refrigerata?=',
  'Content-Type: multipart/mixed; boundary="claim-main"',
  '',
  '--claim-main',
  'Content-Type: multipart/alternative; boundary="claim-body"',
  '',
  '--claim-body',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'The consignee reports that 12 cartons arrived crushed.',
  'The cause and economic value have not been verified by the surveyor.',
  '> Earlier email: the consignee reports that 12 cartons arrived crushed.',
  '--claim-body',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>The consignee reports that 12 cartons arrived crushed.</p>',
  '--claim-body--',
  '--claim-main',
  'Content-Type: application/pdf',
  'Content-Disposition: attachment; filename="packing-list-test.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  'dGVzdCBhdHRhY2htZW50',
  '--claim-main--',
].join('\r\n');

export const europeanTemperatureCsv =
  'time;temperature C\n00:00;"-18,5"\n01:00;"-12,5"\n02:00;"-4,0"\n03:00;sensor offline\n';
