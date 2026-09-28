// Google Maps Platform geocoding for the project-location picker. Used instead
// of Nominatim whenever GOOGLE_MAPS_API_KEY is set: Google resolves Nordic
// street addresses down to the house number, where OSM often only knows the
// street. The key never leaves the server — the app and admin keep calling our
// /projects/geocode/* endpoints, so switching provider needs no client release.

export type AddressSuggestion = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

// Places API (New) and Geocoding API return addresses in this language; "en"
// matches what Nominatim was asked for, so stored project labels stay uniform.
const LANGUAGE = "en";
// Results are biased (not restricted) towards the Nordics/Baltics, where the
// customers build — an address abroad is still found when typed in full.
const REGION = "se";

export const getGoogleMapsApiKey = (): string =>
  process.env.GOOGLE_MAPS_API_KEY?.trim() || "";

// Places API (New) Text Search: handles partial input ("Sõpruse 257") and
// returns coordinates in the same call, so one request per keystroke-debounce.
export async function searchAddressesWithGoogle(
  query: string,
  limit: number,
  apiKey: string,
): Promise<AddressSuggestion[]> {
  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: limit,
        languageCode: LANGUAGE,
        regionCode: REGION,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Google Places search failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    places?: Array<{
      id?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };

  const seenLabels = new Set<string>();
  return (data.places || []).reduce<AddressSuggestion[]>(
    (suggestions, place, index) => {
      const label = place.formattedAddress?.trim();
      const latitude = Number(place.location?.latitude);
      const longitude = Number(place.location?.longitude);

      if (
        !label ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        seenLabels.has(label)
      ) {
        return suggestions;
      }

      seenLabels.add(label);
      suggestions.push({
        id: place.id || `${label}-${index}`,
        label,
        latitude,
        longitude,
      });
      return suggestions;
    },
    [],
  );
}

// Geocoding API reverse lookup: the most precise address for a map tap / pin
// drag / GPS fix. Returns "" when Google knows no address there.
export async function reverseGeocodeWithGoogle(
  latitude: number,
  longitude: number,
  apiKey: string,
): Promise<string> {
  const params = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    language: LANGUAGE,
    key: apiKey,
  });
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(
      `Google reverse geocode failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{ formatted_address?: string }>;
  };

  // The Geocoding API answers 200 even for a bad/unauthorised key; the real
  // outcome is in `status`.
  if (data.status === "ZERO_RESULTS") {
    return "";
  }
  if (data.status !== "OK") {
    throw new Error(
      `Google reverse geocode failed: ${data.status} ${data.error_message || ""}`.trim(),
    );
  }

  return data.results?.[0]?.formatted_address?.trim() || "";
}
