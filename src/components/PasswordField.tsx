"use client";

import { useId, useState } from "react";

type Props = {
  id?: string;
  name: string;
  label: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  defaultValue?: string;
};

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path
        d="M3 3l18 18M10.5 10.7A3 3 0 0012 15a3 3 0 002.3-4.3M6.7 6.8C4.6 8.2 3 10 2 12s3.5 7 10 7c1.8 0 3.4-.4 4.8-1.1M17.3 17.2C19.4 15.8 21 14 22 12s-3.5-7-10-7c-1.1 0-2.1.2-3 .5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PasswordField({ id: idProp, name, label, autoComplete, minLength, required, defaultValue }: Props) {
  const autoId = useId();
  const id = idProp || autoId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field-input-wrap">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          defaultValue={defaultValue}
        />
        <button
          type="button"
          className="password-field-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={0}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}
