import type { PrysmidClient } from "../core/client.js";
import type { Logger } from "../core/logger.js";
import type { Config } from "../core/config.js";
import type { ParsedArgs } from "../args.js";

export interface Ctx {
  client: PrysmidClient;
  log: Logger;
  cfg: Config;
}

export interface LeafCommand {
  kind: "leaf";
  name: string;
  summary: string;
  /** Multi-line help body. Examples included. */
  help: string;
  /** Flags that take a value (besides the global ones). */
  valueFlags?: ReadonlyArray<string>;
  /** Run the command. May return a value to be rendered, or undefined. */
  run: (args: ParsedArgs, ctx: Ctx) => Promise<unknown>;
  /** If true, command does not require an authenticated client. */
  noAuth?: boolean;
}

export interface GroupCommand {
  kind: "group";
  name: string;
  summary: string;
  subcommands: Record<string, Command>;
}

export type Command = LeafCommand | GroupCommand;
