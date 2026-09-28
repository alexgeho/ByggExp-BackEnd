import {
  reverseGeocodeWithGoogle,
  searchAddressesWithGoogle,
} from "./google-geocoder";

const mockFetchJson = (body: unknown, ok = true, status = 200) =>
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);

describe("google-geocoder", () => {
  afterEach(() => jest.restoreAllMocks());

  it("maps Places Text Search results to suggestions, dropping bad/duplicate rows", async () => {
    const fetchSpy = mockFetchJson({
      places: [
        {
          id: "a",
          formattedAddress: "Sõpruse pst 257, 13414 Tallinn, Estonia",
          location: { latitude: 59.41, longitude: 24.68 },
        },
        {
          id: "dup",
          formattedAddress: "Sõpruse pst 257, 13414 Tallinn, Estonia",
          location: { latitude: 59.41, longitude: 24.68 },
        },
        { id: "no-location", formattedAddress: "Somewhere" },
      ],
    });

    const result = await searchAddressesWithGoogle("Sõpruse 257", 5, "KEY");

    expect(result).toEqual([
      {
        id: "a",
        label: "Sõpruse pst 257, 13414 Tallinn, Estonia",
        latitude: 59.41,
        longitude: 24.68,
      },
    ]);
    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
      "KEY",
    );
    expect(JSON.parse(init?.body as string)).toMatchObject({
      textQuery: "Sõpruse 257",
      pageSize: 5,
    });
  });

  it("throws on a non-2xx Places response so the caller can fall back", async () => {
    mockFetchJson({}, false, 403);
    await expect(searchAddressesWithGoogle("x", 5, "KEY")).rejects.toThrow(
      "403",
    );
  });

  it("returns the first reverse-geocode address, '' for no results", async () => {
    mockFetchJson({
      status: "OK",
      results: [{ formatted_address: "Drottninggatan 1, 111 51 Stockholm" }],
    });
    await expect(reverseGeocodeWithGoogle(59.33, 18.06, "KEY")).resolves.toBe(
      "Drottninggatan 1, 111 51 Stockholm",
    );

    mockFetchJson({ status: "ZERO_RESULTS", results: [] });
    await expect(reverseGeocodeWithGoogle(0, 0, "KEY")).resolves.toBe("");
  });

  it("throws when the Geocoding API rejects the key (it still answers 200)", async () => {
    mockFetchJson({ status: "REQUEST_DENIED", error_message: "bad key" });
    await expect(reverseGeocodeWithGoogle(59.33, 18.06, "KEY")).rejects.toThrow(
      "REQUEST_DENIED",
    );
  });
});
