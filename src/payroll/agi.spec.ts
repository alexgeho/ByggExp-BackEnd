import { execFileSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  agiOrgId,
  agiPersonId,
  agiProblems,
  buildAgiXml,
  mergeEmployees,
} from "./agi";

const input = {
  period: "202610",
  orgNumber: "559303-7566",
  createdAt: new Date("2026-11-02T09:00:00Z"),
  contact: { name: "Ägare & Co", phone: "070-757 75 75", email: "a@geal.se" },
  employees: [
    {
      personalNumber: "820225-2386",
      name: "Anna",
      gross: 28500.4,
      tax: 9300,
      workplaceStreet: "Storgatan 1",
      workplaceCity: "Knivsta",
    },
    { personalNumber: "199001011234", name: "Bo", gross: 31000, tax: 10100 },
  ],
};

describe("AGI", () => {
  it("normalises org.nr and personnummer to 12 digits", () => {
    expect(agiOrgId("559303-7566")).toBe("165593037566");
    expect(agiOrgId("123")).toBeNull();
    const today = new Date("2026-10-27");
    expect(agiPersonId("820225-2386", today)).toBe("198202252386");
    expect(agiPersonId("101010-1234", today)).toBe("201010101234");
    expect(agiPersonId("201010+1234", today)).toBe("192010101234");
    expect(agiPersonId("19820225-2386", today)).toBe("198202252386");
  });

  it("lists what blocks the file", () => {
    expect(agiProblems(input)).toEqual([]);
    expect(
      agiProblems({
        ...input,
        orgNumber: "",
        employees: [{ personalNumber: "", name: "Cia", gross: 1, tax: 0 }],
      }),
    ).toEqual(["orgNumber", "personalNumber:Cia"]);
  });

  it("builds one HU + one IU per employee with whole kronor", () => {
    const xml = buildAgiXml(input);
    expect(xml.match(/<agd:IU>/g)).toHaveLength(2);
    expect(xml).toContain(
      '<agd:BetalningsmottagarId faltkod="215">198202252386<',
    );
    expect(xml).toContain('<agd:KontantErsattningUlagAG faltkod="011">28500<');
    expect(xml).toContain('<agd:ArbetsplatsensOrt faltkod="246">Knivsta<');
    expect(xml).toContain("Ägare &amp; Co");
    expect(xml).not.toContain('faltkod="487"');
  });

  it("merges runs per person and drops the place when it differs", () => {
    const m = mergeEmployees([
      {
        personalNumber: "1",
        name: "A",
        gross: 100,
        tax: 30,
        workplaceStreet: "X",
        workplaceCity: "Y",
      },
      {
        personalNumber: "1",
        name: "A",
        gross: 50,
        tax: 10,
        workplaceStreet: "Z",
        workplaceCity: "Y",
      },
    ]);
    expect(m).toEqual([
      {
        personalNumber: "1",
        name: "A",
        gross: 150,
        tax: 40,
        workplaceStreet: undefined,
        workplaceCity: undefined,
      },
    ]);
  });

  // Validates against Skatteverket's XSD when a local copy is present
  // (AGI_XSD=/path/arbetsgivardeklaration_1.1.xsd).
  const xsd = process.env.AGI_XSD;
  (xsd && existsSync(xsd) ? it : it.skip)("is valid against the XSD", () => {
    const f = join(tmpdir(), "agi-test.xml");
    writeFileSync(f, buildAgiXml(input));
    execFileSync("xmllint", ["--noout", "--schema", xsd as string, f]);
  });
});
