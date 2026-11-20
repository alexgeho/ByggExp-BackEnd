import { codesFromHeaders, handledFlag } from "./inbound-mailbox";

describe("inbound mailbox helpers", () => {
  it("reads the code from To / Delivered-To headers", () => {
    expect(
      codesFromHeaders([
        "Faktura <faktura+KP32c5f75c@byggexp.se>",
        "faktura+kp32c5f75c@byggexp.se",
        "someone@example.com",
      ]),
    ).toEqual(["kp32c5f75c"]);
  });

  it("ignores addresses without a code", () => {
    expect(codesFromHeaders(["faktura@byggexp.se", ""])).toEqual([]);
  });

  it("keeps the flag a plain IMAP atom", () => {
    process.env.INBOUND_IMAP_FLAG = "Byggexp Dev!";
    expect(handledFlag()).toBe("ByggexpDev");
    delete process.env.INBOUND_IMAP_FLAG;
    expect(handledFlag()).toBe("ByggexpHandled");
  });
});
