import { describe, it, expect, vi } from "vitest";
import nodemailer from "nodemailer";
import { sendEmail } from "./sendEmail";

vi.mock("nodemailer");

describe("sendEmail", () => {
  it("returns ok:true on a successful SMTP send", async () => {
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) } as never);
    expect(await sendEmail({ to: "a@example.com", subject: "Hi", body: "Hello" })).toEqual({ ok: true });
  });

  it("returns ok:false with the error message on an SMTP failure", async () => {
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as never);
    expect(await sendEmail({ to: "a@example.com", subject: "Hi", body: "Hello" })).toEqual({
      ok: false,
      error: "connection refused",
    });
  });
});
