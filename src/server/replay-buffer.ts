export const appendBoundedReplay = (
  chunks: string[],
  currentBytes: number,
  data: string,
  maxBytes: number,
): number => {
  chunks.push(data);
  let nextBytes = currentBytes + Buffer.byteLength(data);

  while (nextBytes > maxBytes && chunks.length > 0) {
    const overflowBytes = nextBytes - maxBytes;
    const first = chunks[0] ?? "";
    const firstBytes = Buffer.byteLength(first);
    if (firstBytes <= overflowBytes) {
      chunks.shift();
      nextBytes -= firstBytes;
      continue;
    }

    const trimmed = trimStartByUtf8Bytes(first, overflowBytes);
    chunks[0] = trimmed;
    nextBytes -= firstBytes - Buffer.byteLength(trimmed);
  }

  return nextBytes;
};

const trimStartByUtf8Bytes = (value: string, removeBytes: number): string => {
  let index = 0;
  let removedBytes = 0;
  while (index < value.length && removedBytes < removeBytes) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    removedBytes += Buffer.byteLength(char);
    index += char.length;
  }
  return value.slice(index);
};
