export interface CommandDef {
  arity: number;
  flags: string[];
  keyStart: number;
  keyStop: number;
  step: number;
}

export interface CommandDefs {
  [command: string]: CommandDef;
}
