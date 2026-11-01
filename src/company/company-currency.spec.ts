import { CompanyService } from "./company.service";

// A Norwegian company is always stored with NOK, whatever was sent.
describe("company currency follows Norway", () => {
  const make = () => {
    const findByIdAndUpdate = jest.fn(() => ({
      exec: () => Promise.resolve({ _id: "c1" }),
    }));
    const svc = Object.create(CompanyService.prototype) as CompanyService;
    (svc as unknown as { companyModel: unknown }).companyModel = {
      findByIdAndUpdate,
    };
    return { svc, findByIdAndUpdate };
  };

  it("forces NOK when country is set to NO", async () => {
    const { svc, findByIdAndUpdate } = make();
    await svc.update("c1", { country: "NO", currency: "SEK" });
    expect(findByIdAndUpdate.mock.calls[0]).toEqual(
      expect.arrayContaining([{ country: "NO", currency: "NOK" }]),
    );
  });

  it("leaves Swedish companies as sent", async () => {
    const { svc, findByIdAndUpdate } = make();
    await svc.update("c1", { country: "SE", currency: "EUR" });
    expect(findByIdAndUpdate.mock.calls[0]).toEqual(
      expect.arrayContaining([{ country: "SE", currency: "EUR" }]),
    );
  });
});
