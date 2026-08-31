import { z } from "zod";

import { hexColor } from "./text";

export const funnelThemeSchema = z.object({
  primaryColor: hexColor,
  backgroundColor: hexColor,
  textColor: hexColor,
  mutedColor: hexColor,
  borderRadius: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  fontFamily: z.enum(["SYSTEM", "INTER"]),
  buttonStyle: z.enum(["SOLID", "SOFT"]),
});

export type FunnelTheme = z.infer<typeof funnelThemeSchema>;
