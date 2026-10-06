import { z } from "zod";

export const nameSchema = z
  .string()
  .trim()
  .min(2, "O nome precisa ter pelo menos 2 caracteres.")
  .max(80, "O nome pode ter no máximo 80 caracteres.");

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "O apelido precisa ter pelo menos 2 caracteres.")
  .max(24, "O apelido pode ter no máximo 24 caracteres.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .pipe(z.email("E-mail inválido."));

export const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha."),
});

export const signUpSchema = z.object({
  fullName: nameSchema,
  nickname: nicknameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const updateProfileSchema = z.object({
  fullName: nameSchema,
  nickname: nicknameSchema,
});

export const changePasswordSchema = z.object({
  password: passwordSchema,
});

/** First error message of a failed parse, which is all the forms show. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Confira os dados preenchidos.";
}
