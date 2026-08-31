import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter ao menos 2 caracteres.")
    .max(80, "Nome muito longo."),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  role: z.enum(["ADMIN", "MEMBER"], {
    message: "Papel inválido.",
  }),
});

export const changeMemberRoleSchema = z.object({
  memberId: z.string().cuid(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"], {
    message: "Papel inválido.",
  }),
});

export const removeMemberSchema = z.object({
  memberId: z.string().cuid(),
});

export const revokeInvitationSchema = z.object({
  invitationId: z.string().cuid(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20),
});
