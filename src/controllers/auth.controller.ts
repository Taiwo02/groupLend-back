import { Context } from "hono";
import { AuthService } from "../services/auth.service.js";
import {
  loginSchema,
  setLoanPinSchema,
  signupSchema,
  submitIncomeSchema,
  verifyEmailSchema
} from "../validators/auth.validator.js";
import { parseWithSchema, readJsonBody, z } from "../utils/request.js";
import { sanitizeUser } from "../utils/serializers.js";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async signup(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(signupSchema, body) as z.infer<typeof signupSchema>;
    const result = await this.authService.signup({
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      phone: payload.phone,
      location: payload.location,
      monthlyIncome: payload.monthlyIncome,
      employmentStatus: payload.employmentStatus
    });
    return c.json(
      {
        user: sanitizeUser(result.user),
        message: result.message
      },
      201
    );
  }

  async login(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(loginSchema, body) as z.infer<typeof loginSchema>;
    const result = await this.authService.login({
      email: payload.email,
      password: payload.password
    });
    return c.json({
      token: result.token,
      user: sanitizeUser(result.user),
      onboardingState: result.onboardingState
    });
  }

  async submitIncome(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(submitIncomeSchema, body) as z.infer<typeof submitIncomeSchema>;
    const user = await this.authService.submitIncome(c.get("userId"), {
      monthlyIncome: payload.monthlyIncome,
      employmentStatus: payload.employmentStatus
    });
    return c.json({ user: sanitizeUser(user) });
  }

  async setLoanPin(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(setLoanPinSchema, body) as z.infer<typeof setLoanPinSchema>;
    await this.authService.setLoanPin(c.get("userId"), payload.pin);
    return c.json({ message: "Loan PIN set successfully" });
  }

  async verifyEmail(c: Context): Promise<Response> {
    const queryToken = c.req.query("token");
    const token =
      typeof queryToken === "string" && queryToken.length > 0
        ? queryToken
        : c.req.method === "POST"
          ? (await readJsonBody<Record<string, unknown>>(c).then((b) => (b?.token as string) ?? ""))
          : "";
    const payload = parseWithSchema(verifyEmailSchema, { token });
    const result = await this.authService.verifyEmail(payload.token);
    return c.json({
      message: "Email verified successfully. You can now sign in.",
      user: sanitizeUser(result.user)
    });
  }
}
