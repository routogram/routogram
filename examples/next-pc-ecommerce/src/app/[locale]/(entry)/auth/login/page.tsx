import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "../../_components/auth-form/client";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const [login, common] = await Promise.all([
    getTranslations("auth.login"),
    getTranslations("auth.signUp"),
  ]);

  return (
    <AuthForm
      mode="login"
      labels={{
        title: login("title"),
        subtitle: login("subtitle"),
        name: common("name"),
        email: login("email"),
        password: login("password"),
        submit: login("submit"),
        switchLabel: login("noAccount"),
        switchCta: login("signUp"),
        demo: login("demo"),
      }}
    />
  );
}
