export function formatSessionReference(paneId: string | undefined): string | undefined {
  const normalizedPaneId = paneId?.trim();
  return normalizedPaneId ? `Session ${normalizedPaneId}` : undefined;
}
