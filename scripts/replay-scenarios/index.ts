import { evaluative } from "./evaluative";
import { langserve } from "./langserve";
import { mixedModes } from "./mixed-modes";
import type { Scenario } from "./types";

/** Every scenario `npm run eval:replay` runs, in order. */
export const SCENARIOS: readonly Scenario[] = [langserve, mixedModes, evaluative];
