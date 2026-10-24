"use client";

import Link from "next/link";
import Image from "next/image";
import { useId, useState } from "react";
import { Icon } from "./Icon";

function Field({ label, placeholder, type = "text", optional = false }: {
  label: string;
  placeholder: string;
  type?: string;
  optional?: boolean;
}) {
  const id = useId();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}{optional && <small> (Optional)</small>}</label>
      {isPassword ? (
        <div className="auth-field__input-wrap">
          <input id={id} type={passwordVisible ? "text" : "password"} placeholder={placeholder} />
          <button
            className="auth-password-toggle"
            type="button"
            aria-label={`${passwordVisible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            <Icon name={passwordVisible ? "eyeOff" : "eye"} />
          </button>
        </div>
      ) : <input id={id} type={type} placeholder={placeholder} />}
    </div>
  );
}

export function AuthPreview({ request = false }: { request?: boolean }) {
  return (
    <main className="auth-page">
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
          {!request && <h1>Hello,<br /><strong>welcome!</strong></h1>}
        </aside>
        <section className="auth-form-side">
          <div className="auth-form-card">
            <h2>{request ? "Create Account" : "Log In"}</h2>
            <p className="auth-form-card__intro">{request ? "Fill in your details to get started." : "Enter your credentials to access your account."}</p>
            {request ? (
              <>
                <h3 className="auth-section-title">Personal Information</h3>
                <div className="auth-row">
                  <Field label="First Name" placeholder="First name" />
                  <Field label="Last Name" placeholder="Last name" />
                </div>
                <Field label="Middle Name" placeholder="Middle name" optional />
                <Field label="Contact Number" placeholder="09XX XXX XXXX" type="tel" />
                <h3 className="auth-section-title">Account Information</h3>
            <Field label="Email Address" placeholder="you@example.com" type="email" />
                <Field label="Password" placeholder="Enter password" type="password" />
                <Field label="Confirm Password" placeholder="Confirm password" type="password" />
                <button className="auth-submit" type="button" disabled>Create Account</button>
                <p className="auth-switch">Already have an account? <Link href="/login">Log In</Link></p>
              </>
            ) : (
              <>
                <Field label="Email Address" placeholder="you@example.com" type="email" />
                <Field label="Password" placeholder="Enter password" type="password" />
                <button className="auth-submit" type="button" disabled>Log In</button>
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
