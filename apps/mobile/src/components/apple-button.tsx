export interface AppleButtonProps {
  disabled: boolean;
  busy: boolean;
  onSignIn: (authenticate: () => Promise<boolean>) => void;
}

// Metro selects apple-button.ios.tsx only on iOS. Android/web render nothing
// and never import the Apple native module.
export const AppleButton: (props: AppleButtonProps) => null = () => null;
