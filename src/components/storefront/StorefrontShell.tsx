import type { FunnelTheme } from "@/modules/funnels/config/theme";
import { themeToCssVariables } from "./theme";

/**
 * Container raiz do storefront: mobile-first (a página inteira é pensada
 * para ~375–430px), no desktop centraliza num container estreito (não
 * estica a experiência pela tela, sem simular moldura de dispositivo — é
 * uma página web real, só com largura de leitura confortável).
 */
export function StorefrontShell({
  theme,
  children,
}: {
  theme: FunnelTheme;
  children: React.ReactNode;
}) {
  return (
    <div
      style={themeToCssVariables(theme)}
      className="min-h-screen"
      data-storefront-root
    >
      <style>{`
        [data-storefront-root] {
          background: var(--storefront-background);
          color: var(--storefront-text);
          font-family: var(--storefront-font);
        }
      `}</style>
      <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col">{children}</div>
    </div>
  );
}
