import { HttpException } from "@nestjs/common";
import { reserveOutgoingEmail } from "./outgoing-mail-quota";

// updateOne mock: first call = same-day increment, second = new-day reset.
const modelWith = (...modified: number[]) => {
  const updateOne = jest.fn();
  modified.forEach((n) =>
    updateOne.mockResolvedValueOnce({ modifiedCount: n }),
  );
  return { updateOne } as any;
};

describe("reserveOutgoingEmail", () => {
  it("counts a send on the same day", async () => {
    const model = modelWith(1);
    await reserveOutgoingEmail(model, "c1");
    expect(model.updateOne).toHaveBeenCalledTimes(1);
  });

  it("starts a new day at 1", async () => {
    const model = modelWith(0, 1);
    await reserveOutgoingEmail(model, "c1");
    expect(model.updateOne.mock.calls[1][1].$set.outgoingMail.count).toBe(1);
  });

  it("refuses with 429 when today's limit is used up", async () => {
    const model = modelWith(0, 0);
    await expect(reserveOutgoingEmail(model, "c1")).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
