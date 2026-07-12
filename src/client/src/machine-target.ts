export const resolveMachineTargetId = (
  currentMachineId: string,
  machines: ReadonlyArray<{ id: string; source?: "config" | "registered"; online?: boolean }>,
): string => {
  const current = machines.find((machine) => machine.id === currentMachineId);
  if (current && !(current.source === "registered" && current.online === false)) return currentMachineId;
  return machines.find((machine) => machine.source !== "registered")?.id
    ?? machines.find((machine) => machine.online !== false)?.id
    ?? "";
};
