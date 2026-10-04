import { sendGaEvent } from "./ga-measurement";

describe("sendGaEvent", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("does nothing without an API secret", async () => {
    global.fetch = jest.fn() as never;
    expect(await sendGaEvent("sign_up", {}, {}, {})).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts the event with the visitor's GA ids", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as never;
    const ok = await sendGaEvent(
      "sign_up",
      { method: "email" },
      { clientId: "123.456", sessionId: "789" },
      { GA_API_SECRET: "s" },
    );
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("measurement_id=G-551T40R4WV");
    const body = JSON.parse(init.body);
    expect(body.client_id).toBe("123.456");
    expect(body.events[0]).toMatchObject({
      name: "sign_up",
      params: { method: "email", session_id: "789" },
    });
  });
});
