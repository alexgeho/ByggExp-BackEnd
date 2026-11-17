import { AuditService, clientOf } from "./audit.service";

describe("clientOf", () => {
  it("tells the web admin from the mobile app", () => {
    expect(clientOf({ origin: "https://admin.byggexp.se" })).toBe("admin");
    expect(clientOf({ "user-agent": "okhttp/4.12.0" })).toBe("app");
    expect(
      clientOf({ "user-agent": "ByggExp/202 CFNetwork/1568 Darwin/24" }),
    ).toBe("app");
    expect(clientOf({})).toBe("");
  });
});

describe("AuditService", () => {
  const build = () => {
    const created: any[] = [];
    const finds: any[] = [];
    const chain: any = {
      sort: () => chain,
      skip: () => chain,
      limit: () => chain,
      lean: () => chain,
      exec: () => Promise.resolve([]),
    };
    const model: any = {
      create: (doc: any) => {
        created.push(doc);
        return Promise.resolve(doc);
      },
      find: (query: any) => {
        finds.push(query);
        return chain;
      },
      countDocuments: () => ({ exec: () => Promise.resolve(0) }),
    };
    return { service: new AuditService(model), created, finds };
  };

  it("writes a named step with the e-mail lowered and no request data", () => {
    const { service, created } = build();
    service.event({
      event: "login",
      userEmail: "Info@Example.SE",
      success: false,
      message: "Wrong password",
    });
    expect(created[0]).toMatchObject({
      event: "login",
      userEmail: "info@example.se",
      success: false,
      statusCode: 400,
      message: "Wrong password",
      method: "",
      path: "",
    });
  });

  it("a company admin's query stays inside the company; all companies only on null", async () => {
    const { service, finds } = build();
    await service.query("c1", { email: " A@B.se ", failed: true });
    await service.query(null, {});
    expect(finds[0]).toEqual({
      companyId: "c1",
      userEmail: "a@b.se",
      success: false,
    });
    expect(finds[1]).toEqual({});
  });
});
