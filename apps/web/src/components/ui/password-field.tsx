'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

export function PasswordField({
  newPassword = false,
  error,
}: {
  newPassword?: boolean;
  error?: string | undefined;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor="password">{newPassword ? 'New password' : 'Password'}</label>
      <div className="password-input">
        <input
          className="input"
          id="password"
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          minLength={newPassword ? 8 : 1}
          maxLength={128}
          placeholder={newPassword ? 'At least 8 characters' : 'Enter your password'}
          required
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : 'password-error'}
        />
        <button
          type="button"
          className="button-icon"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
        </button>
      </div>
      {error === undefined ? null : (
        <span className="field-error" id="password-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
