import {
  inboundAddressFor,
  isInboundCode,
  newInboundCode,
} from "./inbound-address";

describe("inbound invoice address", () => {
  it("makes lower-case codes without look-alike characters", () => {
    const code = newInboundCode();
    expect(code).toHaveLength(10);
    expect(code).toMatch(/^[a-hjkmnp-z2-9]+$/);
    expect(isInboundCode(code)).toBe(true);
  });

  it("builds the address from the template", () => {
    delete process.env.INBOUND_ADDRESS_TEMPLATE;
    expect(inboundAddressFor("abc234")).toBe("faktura+abc234@byggexp.se");
    process.env.INBOUND_ADDRESS_TEMPLATE = "{code}@in.example.se";
    expect(inboundAddressFor("abc234")).toBe("abc234@in.example.se");
    delete process.env.INBOUND_ADDRESS_TEMPLATE;
  });

  it("rejects anything that is not a code", () => {
    expect(isInboundCode("")).toBe(false);
    expect(isInboundCode("ab")).toBe(false);
    expect(isInboundCode("abc$234")).toBe(false);
    expect(isInboundCode({ $ne: null })).toBe(false);
  });
});
