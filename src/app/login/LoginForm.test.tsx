// src/app/login/LoginForm.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginForm from "./LoginForm";

describe("LoginForm", () => {
  it("shows an inline error when submitted empty", async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/enter your email and password/i)).toBeInTheDocument();
  });

  it("submits the entered credentials to /api/auth/login", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    ));
  });
});
