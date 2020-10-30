/// <reference types="node" />

import { Duplex } from 'stream';

export function spawn({
  specPath: string,
}): {
  input: Duplex;
  output: Duplex;
  error: Duplex;
};
