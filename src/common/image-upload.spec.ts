import { imageFileFilter, safeImageExtension } from "./image-upload";

describe("safeImageExtension", () => {
  it("picks the extension from the image type, not the file name", () => {
    expect(
      safeImageExtension({ mimetype: "image/jpeg", originalname: "x.html" }),
    ).toBe(".jpg");
    expect(
      safeImageExtension({ mimetype: "image/png", originalname: "a.PNG" }),
    ).toBe(".png");
    expect(
      safeImageExtension({
        mimetype: "image/heic",
        originalname: "IMG_1.HEIC",
      }),
    ).toBe(".heic");
    expect(safeImageExtension({ mimetype: "image/webp" })).toBe(".webp");
  });

  it("uses a whitelisted name only for generic types (phones sending HEIC)", () => {
    expect(
      safeImageExtension({
        mimetype: "application/octet-stream",
        originalname: "IMG.HEIC",
      }),
    ).toBe(".heic");
    expect(
      safeImageExtension({
        mimetype: "application/octet-stream",
        originalname: "foto.jpeg",
      }),
    ).toBe(".jpg");
    expect(
      safeImageExtension({
        mimetype: "application/octet-stream",
        originalname: "x.svg",
      }),
    ).toBeNull();
  });

  it("rejects svg, html and other types", () => {
    expect(
      safeImageExtension({ mimetype: "image/svg+xml", originalname: "a.svg" }),
    ).toBeNull();
    expect(
      safeImageExtension({ mimetype: "text/html", originalname: "a.jpg" }),
    ).toBeNull();
    expect(
      safeImageExtension({ mimetype: "image/gif", originalname: "a.gif" }),
    ).toBeNull();
    const cb = jest.fn();
    imageFileFilter(
      null,
      { mimetype: "image/svg+xml", originalname: "heic.svg" },
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, false);
  });
});
