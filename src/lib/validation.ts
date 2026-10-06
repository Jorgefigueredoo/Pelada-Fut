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

/** Value of a `datetime-local` input, read in the app time zone. */
export const dateTimeLocalSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e hora.");

export const gameSchema = z
  .object({
    startsAt: dateTimeLocalSchema,
    listOpensAt: dateTimeLocalSchema,
    location: z.string().trim().max(120, "O local pode ter no máximo 120 caracteres."),
    slots: z.coerce
      .number()
      .int("O número de vagas tem que ser inteiro.")
      .min(2, "No mínimo 2 vagas.")
      .max(100, "No máximo 100 vagas."),
  })
  .refine((value) => value.listOpensAt <= value.startsAt, {
    message: "A lista não pode abrir depois do jogo.",
    path: ["listOpensAt"],
  });
