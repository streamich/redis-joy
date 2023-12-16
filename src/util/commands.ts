import type {Cmd, MultiCmd} from '../types';

export const isMultiCmd = (cmd: Cmd | MultiCmd): cmd is MultiCmd => cmd[0] instanceof Array;
