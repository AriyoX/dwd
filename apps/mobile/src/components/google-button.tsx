import { Image } from 'react-native';
import { SocialSignInButton, SOCIAL_LOGO_SIZE } from './social-sign-in-button';
// Current, unmodified Google asset: https://developers.google.com/identity/branding-guidelines
import googleLogo from '../../assets/google-g.png';

export function GoogleButton({
  onPress,
  disabled,
  busy = false,
}: {
  onPress: () => void;
  disabled: boolean;
  busy?: boolean;
}) {
  return (
    <SocialSignInButton
      provider="Google"
      disabled={disabled}
      busy={busy}
      onPress={onPress}
      icon={
        <Image
          alt=""
          source={googleLogo}
          style={{ width: SOCIAL_LOGO_SIZE, height: SOCIAL_LOGO_SIZE }}
          resizeMode="contain"
          accessible={false}
        />
      }
    />
  );
}
