"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { FirstLoginForm, LoginForm } from "./StaffAuthForms";
import { TenantRecoveryForm, TenantResetForm } from "./TenantPasswordForms";
import { AccountRequestForm } from "./AccountRequestForm";

export function AuthPreview({ request = false, firstLogin = false, recovery = false, reset = false, refineLogin = false, refineAuth = false }: {
  request?: boolean; firstLogin?: boolean; recovery?: boolean; reset?: boolean; refineLogin?: boolean; refineAuth?: boolean;
}) {
  const [recoverySent, setRecoverySent] = useState(false);
  const title = request ? "Create Account" : firstLogin ? "Change Password" : recovery ? recoverySent ? "Check your email" : "Reset Password" : reset ? "Choose a New Password" : "Log In";
  const pageClass = [
    "auth-page",
    refineLogin ? "auth-page--login" : refineAuth ? "auth-page--refined" : "",
    request && refineAuth ? "auth-page--request" : "",
  ].filter(Boolean).join(" ");
  return (
    <main className={pageClass}>
      <div className="auth-orb auth-orb--top" aria-hidden="true" />
      <div className="auth-orb auth-orb--red" aria-hidden="true" />
      <div className="auth-orb auth-orb--dark" aria-hidden="true" />
      <section className={`auth-card${request ? " auth-card--request" : ""}`}>
        <aside className="auth-brand-panel">
          <Link className="auth-brand" href="/" aria-label="MapSilip home">
            <Image
              className="auth-brand__logo"
              src="/mapsilip-logo-combi.svg"
              alt=""
              width="1073"
              height="419"
              unoptimized
            />
          </Link>
          <p className="auth-product-name">Dormitory Management System</p>
          {(refineLogin
            ? <p className="auth-greeting">Hello,<br /><strong>welcome!</strong></p>
            : <h1>Hello,<br /><strong>welcome!</strong></h1>)}
        </aside>
        <section className="auth-form-side" aria-labelledby={refineLogin ? "login-heading" : undefined}>
          <div className="auth-form-card">
            {refineLogin ? <h1 id="login-heading">{title}</h1> : <h2>{title}</h2>}
            {!(recovery && recoverySent) && <p className="auth-form-card__intro">{request ? "Fill in your details to get started." : firstLogin ? "Replace your temporary password to continue." : recovery ? "Enter your account email to request a password reset link." : reset ? "Choose a new password for your account." : "Enter your email and password to access MapSilip."}</p>}
            {request ? (
              <>
                <AccountRequestForm />
                <p className="auth-switch">Already have an account? <Link href="/login">Log In</Link></p>
              </>
            ) : firstLogin ? (
              <>
                <FirstLoginForm />
                <p className="auth-switch"><Link href="/login">Return to Log In</Link></p>
              </>
            ) : recovery ? (
              <TenantRecoveryForm onSentChange={setRecoverySent} />
            ) : reset ? (
              <TenantResetForm />
            ) : (
              <>
                <LoginForm />
                <div className="auth-divider" />
                <p className="auth-switch">Don&apos;t have a tenant account?</p>
                <Link className="auth-request-link" href="/request-account">Request Tenant Account</Link>
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
