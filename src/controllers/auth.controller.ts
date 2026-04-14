import { Context } from "hono";
import { AuthService } from "../services/auth.service.js";
import {
  changePasswordSchema,
  forgetPasswordSchema,
  loginSchema,
  setLoanPinSchema,
  setPasswordSchema,
  signupSchema,
  submitIncomeSchema,
  updateProfileSchema,
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
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(verifyEmailSchema, body);
    const result = await this.authService.verifyEmail(payload.token);
    if (!result.success) {
      return c.json({ success: false, message: result.message });
    }
    return c.json({
      success: true,
      token: result.token,
      user: sanitizeUser(result.user),
      onboardingState: result.onboardingState,
      message: "Email verified successfully."
    });
  }

  async getProfile(c: Context): Promise<Response> {
    const user = await this.authService.getProfile(c.get("userId"));
    return c.json({ user: sanitizeUser(user) });
  }

  async updateProfile(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(updateProfileSchema, body);
    const user = await this.authService.updateProfile(c.get("userId"), payload);
    return c.json({ user: sanitizeUser(user) });
  }

  async forgetPassword(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(forgetPasswordSchema, body);
    await this.authService.forgetPassword(payload.email);
    return c.json({
      message: "If an account exists with this email, we sent a password reset link."
    });
  }

  async setPassword(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(setPasswordSchema, body) as z.infer<typeof setPasswordSchema>;
    const result = await this.authService.setPassword(payload.token, payload.password);
    return c.json({
      message: "Password has been reset. You can now sign in.",
      user: sanitizeUser(result.user)
    });
  }

  async changePassword(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(changePasswordSchema, body) as z.infer<typeof changePasswordSchema>;
    const user = await this.authService.changePassword(
      c.get("userId"),
      payload.currentPassword,
      payload.newPassword
    );
    return c.json({ message: "Password changed successfully", user: sanitizeUser(user) });
  }
}
