export const resolveMachineTargetId = (
  currentMachineId: string,
  machines: ReadonlyArray<{ id: string }>,
): string => {
  if (machines.some((machine) => machine.id === currentMachineId)) return currentMachineId;
  return machines[0]?.id ?? "";
};
