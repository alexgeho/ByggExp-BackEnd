import {
  agreementPdfLinks,
  draftsFromExtraction,
} from "./agreement-draft.util";

describe("agreement documents on byggnads.se", () => {
  const page = [
    '<a href="https://www.byggnads.se/49ec78/siteassets/kollektivavtal/byggavtalet-2025-digital-utgava-1.pdf" download="">',
    '<a href="/49e5fe/siteassets/avtalsrorelsen/2025/hangavtalsinformation-byggavtalet-2025-2027.pdf" download="">',
    '<a href="https://www.byggnads.se/48ce12/siteassets/kollektivavtal/the-construction-agreement-2025.pdf">',
    '<a href="https://www.byggnads.se/4a728f/siteassets/kollektivavtal/glasmasteriavtalet-2025-2027.pdf">',
    '<a href="https://www.byggnads.se/49ec78/siteassets/kollektivavtal/byggavtalet-2025-digital-utgava-1.pdf">',
  ].join("\n");

  it("keeps only Byggavtalet PDFs, absolute and without duplicates", () => {
    expect(
      agreementPdfLinks(page, "https://www.byggnads.se/stod-pa-jobbet/x/"),
    ).toEqual([
      "https://www.byggnads.se/49ec78/siteassets/kollektivavtal/byggavtalet-2025-digital-utgava-1.pdf",
      "https://www.byggnads.se/49e5fe/siteassets/avtalsrorelsen/2025/hangavtalsinformation-byggavtalet-2025-2027.pdf",
    ]);
  });
});

describe("drafts from an extraction", () => {
  const base = {
    _id: "x",
    name: "Byggavtalet 2023",
    validFrom: "2023-05-01",
    mileage: 25,
    status: "published",
  };

  it("makes one draft per wage period, sharing supplements and keeping base rules", () => {
    const drafts = draftsFromExtraction(
      {
        name: "Byggavtalet 2025–2027",
        periods: [
          {
            validFrom: "2026-05-01",
            validTo: "2027-04-30",
            wageRaise: { kind: "fixed", value: 6.85, quote: "q2" },
            minimumWages: [{ category: "yrkesarbetare", hourly: 203 }],
          },
          {
            validFrom: "2025-05-01",
            validTo: "2026-04-30",
            wageRaise: { kind: "fixed", value: 7.54, quote: "q1" },
            minimumWages: [
              { category: "yrkesarbetare", hourly: 196 },
              { category: "okand", hourly: 1 },
            ],
          },
        ],
        hourTypeSupplements: [
          { hourType: "ob", label: "OB 1", kind: "percent", value: 20 },
        ],
        vacationPayPercent: { value: 13 },
      },
      base,
      "byggavtalet.pdf",
      "2026-10-23",
    );
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.name)).toEqual([
      "Byggavtalet 2025–2027, år 1",
      "Byggavtalet 2025–2027, år 2",
    ]);
    expect(drafts[0]).toMatchObject({
      validFrom: "2025-05-01",
      validTo: "2026-04-30",
      wageRaiseValue: 7.54,
      status: "draft",
      aiDraft: true,
      mileage: 25,
      vacationPayPercent: 13,
    });
    expect(drafts[0].minimumWages).toEqual([
      { category: "yrkesarbetare", label: "", hourly: 196 },
    ]);
    expect(drafts[1]).toMatchObject({
      validFrom: "2026-05-01",
      wageRaiseValue: 6.85,
    });
    expect(drafts[1].hourTypeSupplements).toHaveLength(1);
    expect(drafts[0]._id).toBeUndefined();
  });

  it("still makes one draft when no period is stated", () => {
    const drafts = draftsFromExtraction({}, base, "text", "2026-10-23");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      validFrom: "2023-05-01",
      name: "Byggavtalet från 2023-05-01",
      wageRaiseKind: null,
    });
  });
});
