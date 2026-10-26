import {
  buildOrderEmail,
  buildQuickOrderCsv,
  formatQuantity,
} from "./order-format";

describe("material order format", () => {
  it("formats quantities with a Swedish decimal comma", () => {
    expect(formatQuantity(12)).toBe("12");
    expect(formatQuantity(2.5)).toBe("2,5");
    expect(formatQuantity(0.1 + 0.2)).toBe("0,3");
  });

  it("builds a semicolon quick-order CSV: artikelnummer;antal first", () => {
    const csv = buildQuickOrderCsv([
      {
        articleNumber: "1820012",
        name: "Kabel EKK 3G1,5",
        unit: "m",
        quantity: 100,
      },
      { articleNumber: "5000123", name: 'Dosa "djup"; vit', quantity: 2.5 },
      { articleNumber: "", name: "Fritext utan nummer", quantity: 1 },
      { articleNumber: "999", name: "noll", quantity: 0 },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Artikelnummer;Antal;Enhet;Benämning",
      "1820012;100;m;Kabel EKK 3G1,5",
      '5000123;2,5;st;"Dosa ""djup""; vit"',
      "",
    ]);
  });

  it("builds a Swedish order mail with customer number and delivery facts", () => {
    const mail = buildOrderEmail(
      [
        {
          articleNumber: "1820012",
          name: "Kabel <EKK>",
          unit: "m",
          quantity: 100,
        },
      ],
      {
        orderNumber: 7,
        supplier: "Lundagrossisten",
        customerNumber: "12345",
        companyName: "Geal Bygg AB",
        projectReference: "Villa Ek",
        deliveryAddress: "Storgatan 1, Lund",
        desiredDate: "2026-11-02",
        comment: "Ring vid leverans",
      },
    );
    expect(mail.subject).toBe(
      "Beställning 7 — Geal Bygg AB — kundnr 12345 — Villa Ek",
    );
    expect(mail.text).toContain("Leveransadress: Storgatan 1, Lund");
    expect(mail.text).toContain("Önskat leveransdatum: 2026-11-02");
    expect(mail.text).toContain("1820012\t100 m\tKabel <EKK>");
    expect(mail.html).toContain("Kabel &lt;EKK&gt;");
    expect(mail.html).not.toContain("Org.nr");
  });
});
