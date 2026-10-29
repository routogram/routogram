"use client";

import { useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { login } from "@/lib/apis/graphql";
import { CONSTANTS } from "@/lib/constants";
import { type AuthFormLabels, AuthFormTemplate } from "./template";

export function AuthForm({ mode, labels }: { mode: "login" | "sign-up"; labels: AuthFormLabels }) {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = await login(values.email, values.password);
      window.localStorage.setItem(
        CONSTANTS.STORAGE.auth,
        JSON.stringify({ ...payload, name: values.name || payload.user.name }),
      );
      router.push(CONSTANTS.ROUTES.console);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormTemplate
      mode={mode}
      labels={labels}
      values={values}
      loading={loading}
      error={error}
      onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      onSubmit={handleSubmit}
    />
  );
}
