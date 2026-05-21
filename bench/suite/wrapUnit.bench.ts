import type { BenchDef } from "./core/types.d.ts";

const def: BenchDef = {
  name: "wrapUnit",
  notes: [
    "| 0 and ~~ truncate toward zero — they require a negative fixup branch.",
    "Both overflow beyond ±2³¹; mark them unsafe for the 'large' range.",
    "Math.floor is branchless and safe at all magnitudes.",
    "The subtraction loop is optimal only when inputs are guaranteed unit [0,1).",
  ].join(" "),

  variants: [
    {
      name: "Math.floor",
      code: "u -= Math.floor(u); return u",
      fn: (u) => { u -= Math.floor(u); return u; },
    },
    {
      name: "modulo + branch",
      code: "u = u % 1; return u < 0 ? u + 1 : u",
      fn: (u) => { u = u % 1; return u < 0 ? u + 1 : u; },
    },
    {
      name: "Math.trunc + branch",
      code: "u -= Math.trunc(u); return u < 0 ? u + 1 : u",
      fn: (u) => { u -= Math.trunc(u); return u < 0 ? u + 1 : u; },
    },
    {
      name: "~~u + branch",
      code: "u -= ~~u; return u < 0 ? u + 1 : u",
      fn: (u) => { u -= ~~u; return u < 0 ? u + 1 : u; },
      unsafeFor: ["large"],
    },
    {
      name: "bitwise | 0 + branch",
      code: "u -= (u | 0); return u < 0 ? u + 1 : u",
      fn: (u) => { u -= (u | 0); return u < 0 ? u + 1 : u; },
      unsafeFor: ["large"],
    },
    {
      name: "subtraction loop",
      code: "while(u>=1)u-=1; while(u<0)u+=1; return u",
      fn: (u) => { while (u >= 1) u -= 1; while (u < 0) u += 1; return u; },
      unsafeFor: ["large"],
    },
  ],
};

export default def;
