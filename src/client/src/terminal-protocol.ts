// ghostty-web emits terminal-generated answers through the same onData event as
// keyboard input. Tag the bounded reply forms we understand so transports can
// distinguish them without mistaking ordinary escape-prefixed key sequences.
const TERMINAL_PROTOCOL_RESPONSES = /^(?:(?:\x1b\[[?>]?[0-9;]*c)|(?:\x1b\[(?:0n|[0-9]+;[0-9]+R)))+$/;

export const isTerminalProtocolResponse = (data: string): boolean => TERMINAL_PROTOCOL_RESPONSES.test(data);
