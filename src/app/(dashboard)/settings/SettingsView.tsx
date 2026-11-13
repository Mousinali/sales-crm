"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import Avatar from "@/components/ui/Avatar";
import ChangePasswordForm from "@/app/change-password/ChangePasswordForm";
import { compressImage } from "./compressImage";

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <p className="mt-1 mb-5 text-sm text-zinc-500">{description}</p>
      {children}
    </section>
  );
}

export default function SettingsView({
  name,
  title,
  avatarUrl: initialAvatarUrl,
  phone: initialPhone,
  whatsappNumber: initialWhatsappNumber,
}: {
  name: string;
  title: string;
  avatarUrl: string | null;
  phone: string | null;
  whatsappNumber: string | null;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState(initialPhone ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(initialWhatsappNumber ?? "");
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setAvatarError(null);
    try {
      const compressed = await compressImage(file);
      setPreview(compressed);
    } catch {
      setAvatarError("Could not read that image. Try a different file.");
    }
  }

  async function saveAvatar() {
    if (!preview) return;
    setUploading(true);
    setAvatarError(null);
    try {
      const response = await fetch("/api/users/me/avatar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarUrl: preview }),
      });
      if (!response.ok) {
        setAvatarError("Could not save your photo. Try again.");
        toast.error("Could not save photo");
        setUploading(false);
        return;
      }
      setAvatarUrl(preview);
      setPreview(null);
      toast.success("Profile photo updated");
    } catch {
      setAvatarError("Could not save your photo. Try again.");
      toast.error("Could not save photo");
    } finally {
      setUploading(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    setAvatarError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleContactSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContactError(null);
    setSavingContact(true);
    try {
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), whatsappNumber: whatsappNumber.trim() }),
      });
      if (!response.ok) {
        setContactError("Could not save your contact details. Try again.");
        toast.error("Could not save contact details");
        return;
      }
      toast.success("Contact details updated");
    } catch {
      setContactError("Could not save your contact details. Try again.");
      toast.error("Could not save contact details");
    } finally {
      setSavingContact(false);
    }
  }

  return (
    <div className="grid max-w-4xl grid-cols-1 items-start gap-6 lg:grid-cols-[17rem_1fr]">
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex flex-col items-center text-center">
          <Avatar name={name} imageUrl={preview ?? avatarUrl} size="lg" />
          <p className="mt-4 text-base font-semibold text-zinc-900">{name}</p>
          <p className="text-sm text-zinc-500">{title}</p>

          <div className="mt-5 flex w-full flex-col gap-2">
            {preview ? (
              <>
                <button
                  type="button"
                  onClick={saveAvatar}
                  disabled={uploading}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? "Saving…" : "Save photo"}
                </button>
                <button
                  type="button"
                  onClick={cancelPreview}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <i className="ri-image-add-line" aria-hidden="true" />
                {avatarUrl ? "Change photo" : "Upload photo"}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => handleFileSelected(event.target.files?.[0])}
              className="hidden"
            />
            {avatarError && (
              <p role="alert" className="text-sm text-red-600">
                {avatarError}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-6">
        <SettingsCard title="Contact details" description="Keep these up to date so colleagues can reach you.">
          <form onSubmit={handleContactSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="settingsPhone" className="text-sm font-medium text-zinc-700">
                Contact number
              </label>
              <div className="relative">
                <i
                  className="ri-phone-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  id="settingsPhone"
                  type="text"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Add a contact number"
                  className="w-full rounded-xl border border-zinc-200 py-2.5 pr-3 pl-10 text-base text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="settingsWhatsapp" className="text-sm font-medium text-zinc-700">
                WhatsApp number
              </label>
              <div className="relative">
                <i
                  className="ri-whatsapp-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  id="settingsWhatsapp"
                  type="text"
                  value={whatsappNumber}
                  onChange={(event) => setWhatsappNumber(event.target.value)}
                  placeholder="Add a WhatsApp number"
                  className="w-full rounded-xl border border-zinc-200 py-2.5 pr-3 pl-10 text-base text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </div>
            </div>

            {contactError && (
              <p role="alert" className="text-sm text-red-600 sm:col-span-2">
                {contactError}
              </p>
            )}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={savingContact}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingContact ? (
                  <>
                    <i className="ri-loader-4-line animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  "Save contact details"
                )}
              </button>
            </div>
          </form>
        </SettingsCard>

        <SettingsCard title="Change password" description="Forgot your current password? Contact your admin to reset it.">
          <ChangePasswordForm requireCurrentPassword onSuccess={() => toast.success("Password updated")} />
        </SettingsCard>
      </div>
    </div>
  );
}
