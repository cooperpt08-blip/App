import { Body, Eyebrow, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';

// Placeholder: the live list of cut cards is built in step 3.
export default function Upcoming() {
  const { membership } = useAccount();
  return (
    <Screen>
      <Eyebrow>{membership?.display_name}</Eyebrow>
      <Title>Upcoming cuts</Title>
      <Body muted>Cut cards your clients send to the shop will show up here, soonest appointment first.</Body>
      <Notice tone="note">This tab gets built in step 3. For now, set up your shop in the “My shop” tab.</Notice>
    </Screen>
  );
}
