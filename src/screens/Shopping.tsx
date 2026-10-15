import { FinanceScreen } from './FinanceScreen';

export function OurWallet() {
  return <FinanceScreen scope="household" title="Our Wallet" />;
}

export function MyWallet() {
  return <FinanceScreen scope="personal" title="My Wallet" />;
}

export function Shopping() {
  return <OurWallet />;
}
