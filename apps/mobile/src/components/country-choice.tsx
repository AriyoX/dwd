import { useState } from 'react';
import { COUNTRY_PROFILES, countryProfile, type CountryCode } from '@dwd/core';
import { Choice } from './choice';
import { PrimaryButton } from './primary-button';

export function CountryChoice({
  value,
  onChange,
  disabled = false,
  label = 'Country',
}: {
  value: CountryCode | null;
  onChange: (code: CountryCode) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <PrimaryButton
        label={`${label}: ${countryProfile(value)?.name ?? 'Choose'}`}
        variant="secondary"
        disabled={disabled}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded || !value
        ? COUNTRY_PROFILES.map((profile) => (
            <Choice
              key={profile.code}
              compact
              label={profile.name}
              selected={profile.code === value}
              disabled={disabled}
              onPress={() => {
                onChange(profile.code as CountryCode);
                setExpanded(false);
              }}
            />
          ))
        : null}
    </>
  );
}
