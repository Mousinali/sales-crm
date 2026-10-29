// src/app/login/LoginForm.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    ));
  });

  it("toggles the password field between hidden and visible", () => {
    render(<LoginForm />);
    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("shows the server's actual error instead of a generic one, e.g. a rate-limit message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), { status: 429 })
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });

  it("counts down the lockout, disables the button, then re-enables it at zero", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many attempts. Try again later.", retryAfterSeconds: 2 }), { status: 429 })
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "1234" } });

    // fake timers block Testing Library's usual setInterval-based polling
    // (findBy/waitFor), so the submit's fetch microtask chain is flushed
    // manually inside `act` instead of awaited via a `findBy*` query.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts. Try again in 0:02.");
    expect(screen.getByRole("button", { name: /try again in 0:02/i })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts. Try again in 0:01.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();

    vi.useRealTimers();
  });
});
