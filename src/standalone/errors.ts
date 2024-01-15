export const isNoscriptError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const msg = error.message;
    return (
      msg.charCodeAt(0) === 78 && // N
      msg.charCodeAt(1) === 79 && // O
      msg.charCodeAt(2) === 83 && // S
      msg.charCodeAt(3) === 67 && // C
      msg.charCodeAt(4) === 82 && // R
      msg.charCodeAt(5) === 73 && // I
      msg.charCodeAt(6) === 80 && // P
      msg.charCodeAt(7) === 84 // T
    );
  }
  return false;
};
