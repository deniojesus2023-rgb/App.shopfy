import { funnelConfigV1Schema } from "./schema";

// Config inicial do template seed — validado pelo mesmo schema Zod usado
// para config de usuário, para nunca divergir do que a aplicação aceitaria.
// Separado de prisma/seed.ts para poder ser importado em testes sem
// disparar a execução do script de seed (que toca o banco).
export const progressRewardCodDefaultConfig = funnelConfigV1Schema.parse({
  schemaVersion: 1,
  theme: {
    primaryColor: "#111827",
    backgroundColor: "#FFFFFF",
    textColor: "#111827",
    mutedColor: "#6B7280",
    borderRadius: "MEDIUM",
    fontFamily: "SYSTEM",
    buttonStyle: "SOLID",
  },
  steps: [
    {
      id: "product",
      type: "PRODUCT",
      enabled: true,
      order: 0,
      config: {
        headline: "Conheça o produto",
        showRating: true,
        ratingValue: 4.8,
        ratingCount: 1200,
        showBenefits: true,
        benefits: ["Entrega rápida", "Garantia de satisfação", "Pagamento na entrega"],
        showCompareAtPrice: true,
        ctaText: "QUERO O MEU",
      },
    },
    {
      id: "reward",
      type: "REWARD",
      enabled: true,
      order: 1,
      config: {
        title: "VOCÊ TEM UM BENEFÍCIO!",
        subtitle: "Continue para desbloquear",
        rewardDisplayType: "PERCENTAGE",
        displayValue: "15%",
        initialProgress: 85,
        ctaText: "DESBLOQUEAR",
      },
    },
    {
      id: "offer",
      type: "OFFER",
      enabled: true,
      order: 2,
      config: {
        offers: [
          { id: "qty-1", quantity: 1, label: "1 unidade" },
          { id: "qty-2", quantity: 2, label: "2 unidades", badge: "MAIS ESCOLHIDO" },
          { id: "qty-3", quantity: 3, label: "3 unidades", badge: "MAIOR BENEFÍCIO" },
        ],
      },
    },
    {
      id: "payment-choice",
      type: "PAYMENT_CHOICE",
      enabled: true,
      order: 3,
      config: {
        allowCod: true,
        allowOnlinePayment: true,
        codLabel: "Pagar na entrega",
        onlinePaymentLabel: "Pagar agora",
        codDescription: "Pague em dinheiro quando receber.",
        onlinePaymentDescription: "Pague com cartão e ganhe desconto.",
        onlinePaymentDiscountDisplay: "5% OFF",
      },
    },
    {
      id: "cod-form",
      type: "COD_FORM",
      enabled: true,
      order: 4,
      config: {
        fields: [
          { key: "NAME", enabled: true, required: true },
          { key: "PHONE", enabled: true, required: true },
          { key: "COUNTRY", enabled: true, required: true },
          { key: "STATE", enabled: true, required: true },
          { key: "CITY", enabled: true, required: true },
          { key: "ADDRESS", enabled: true, required: true },
          { key: "ADDRESS_REFERENCE", enabled: true, required: false },
        ],
        submitButtonText: "CONFIRMAR PEDIDO",
        paymentNotice: "Pagamento em dinheiro no momento da entrega.",
      },
    },
    {
      id: "success",
      type: "SUCCESS",
      enabled: true,
      order: 5,
      config: {
        title: "Pedido confirmado!",
        subtitle: "Em breve entraremos em contato.",
        showOrderNumber: true,
        showRewardProgress: true,
      },
    },
    {
      id: "upsell",
      type: "UPSELL",
      enabled: true,
      order: 6,
      config: {
        headline: "Adicione mais um item com desconto exclusivo",
        productRole: "UPSELL",
        ctaText: "ADICIONAR AGORA",
        declineText: "Não, obrigado",
      },
    },
  ],
  settings: {},
});

export const PROGRESS_REWARD_COD_TEMPLATE = {
  key: "progress-reward-cod-v1",
  name: "Progress Reward COD",
  description: "Funil com barra de progresso/recompensa, ofertas por quantidade e checkout COD.",
  configSchemaVersion: 1,
  defaultConfig: progressRewardCodDefaultConfig,
  isActive: true,
} as const;
