import { PDFDocument } from "pdf-lib";
import { MAX_SCAN_PDF_PAGES, ScanningService } from "./scanning.service";

async function pdfWithPages(n: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage();
  return Buffer.from(await doc.save());
}

async function pageCount(buffer: Buffer): Promise<number> {
  return (await PDFDocument.load(buffer)).getPageCount();
}

describe("ScanningService.firstPdfPages", () => {
  const service = new ScanningService();

  it("sends only the first pages of a long PDF", async () => {
    const out = await service.firstPdfPages(await pdfWithPages(15));
    expect(await pageCount(out)).toBe(MAX_SCAN_PDF_PAGES);
  });

  it("leaves a short PDF untouched", async () => {
    const input = await pdfWithPages(3);
    expect(await service.firstPdfPages(input)).toBe(input);
  });

  it("returns an unreadable file as-is", async () => {
    const junk = Buffer.from("not a pdf");
    expect(await service.firstPdfPages(junk)).toBe(junk);
  });
});
