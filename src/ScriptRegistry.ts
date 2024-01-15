import {createHash} from 'crypto';

export class Script {
  public readonly sha1: Uint8Array;

  constructor(public readonly script: string) {
    const hash = createHash('sha1').update(script).digest('hex');
    this.sha1 = Buffer.from(hash);
  }
}

export class ScriptRegistry {
  protected map: Map<string, Script> = new Map();

  public set(id: string, script: string) {
    const s = new Script(script);
    this.map.set(id, s);
  }

  public get(id: string): Script | undefined {
    return this.map.get(id);
  }
}
