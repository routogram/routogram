import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "../../_components/auth-form/client";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  const [signUp, login] = await Promise.all([
    getTranslations("auth.signUp"),
    getTranslations("auth.login"),
  ]);

  return (
    <AuthForm
      mode="sign-up"
      labels={{
        title: signUp("title"),
        subtitle: signUp("subtitle"),
        name: signUp("name"),
        email: signUp("email"),
        password: signUp("password"),
        submit: signUp("submit"),
        switchLabel: signUp("hasAccount"),
        switchCta: signUp("login"),
        demo: login("demo"),
      }}
    />
  );
}
