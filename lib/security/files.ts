export function validateFile(name: string, mime: string, bytes: Uint8Array) {
  if (bytes.length > 10 * 1024 * 1024)
    throw new Error("Maximum attachment size is 10 MB");
  const starts = (signature: number[]) =>
    signature.every((b, i) => bytes[i] === b);
  if (mime === "image/png" && starts([137, 80, 78, 71, 13, 10, 26, 10]))
    return mime;
  if (mime === "image/jpeg" && starts([255, 216, 255])) return mime;
  if (mime === "application/pdf" && starts([37, 80, 68, 70, 45])) return mime;
  if (
    ["text/plain", "text/markdown"].includes(mime) &&
    /\.(txt|md)$/i.test(name)
  ) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0") || /^\s*<(?:!doctype|html|svg|script)/i.test(text))
      throw new Error("Executable or binary text is not accepted");
    return mime;
  }
  throw new Error("File content and supported MIME type must match");
}
