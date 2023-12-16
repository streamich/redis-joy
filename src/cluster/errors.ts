export const isMovedError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const msg = error.message;
    return msg.charCodeAt(0) === 77 && // M
      msg.charCodeAt(1) === 79 && // O
      msg.charCodeAt(2) === 86 && // V
      msg.charCodeAt(3) === 69 && // E
      msg.charCodeAt(4) === 68; // D
  }
  return false;
};

export const isAskError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const msg = error.message;
    return msg.charCodeAt(0) === 65 && // A
      msg.charCodeAt(1) === 83 && // S
      msg.charCodeAt(2) === 75; // K
  }
  return false;
};

const movedErrorRegex = /^MOVED [0-9]+ ([^:]*):([0-9]+)\s*$/;
export const parseMovedError = (message: string): [endpoint: string, port: number] => {
  const match = movedErrorRegex.exec(message);
  if (!match) throw new Error('NOT_MOVED_ERROR');
  return [match[1], +match[2]];
};
