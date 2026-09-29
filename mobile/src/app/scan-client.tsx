import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Body, Button, colors, Field, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { parseClientCode } from '@/lib/clients';
import { friendlyError, supabase } from '@/lib/supabase';

// A barber scans the cut card code a new client shows on their phone.
export default function ScanClient() {
  const { loading, membership } = useAccount();
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The camera reports the same code many times a second; only handle it once.
  const handling = useRef(false);

  async function redeem(raw: string) {
    const code = parseClientCode(raw);
    if (!code) {
      setError('That isn’t a Shape Up client code. Ask the client to open “Show my cut card code”.');
      return;
    }
    if (handling.current) return;
    handling.current = true;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('redeem_share_code', { p_code: code });
    setBusy(false);
    if (error) {
      setError(friendlyError(error));
      // Let them try again after a moment, so a bad scan doesn't loop.
      setTimeout(() => (handling.current = false), 1500);
      return;
    }
    const client = (data as { customer_id: string; first_name: string }[])[0];
    router.replace(`/client/${client.customer_id}`);
  }

  function onScan(result: BarcodeScanningResult) {
    if (!handling.current) redeem(result.data);
  }

  if (loading) return <Loading />;
  if (!membership) return <Redirect href="/" />;

  return (
    <Screen>
      <Title>Scan a client’s code</Title>
      <Body muted>
        Ask the client to open Shape Up and tap “Show my cut card code”. Point your camera at the QR code on their phone.
      </Body>

      {permission?.granted ? (
        <View style={{ width: '100%', maxWidth: 480, aspectRatio: 1, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', backgroundColor: colors.ink }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : onScan}
          />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Notice tone="note">
            {permission && !permission.canAskAgain
              ? 'Camera access is turned off for Expo Go / Shape Up. Turn it on in the iPhone Settings app, or type the code below.'
              : 'Shape Up needs your camera to scan the client’s code.'}
          </Notice>
          {(!permission || permission.canAskAgain) && <Button title="Turn on camera" onPress={requestPermission} />}
        </View>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <Field
        label="Or type the 8-letter code"
        value={typed}
        onChangeText={(t) => setTyped(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
        placeholder="ABCD-EFGH"
      />
      <Button
        title="Add client"
        onPress={() => {
          handling.current = false;
          redeem(typed);
        }}
        loading={busy}
        disabled={typed.replace(/[^A-Za-z0-9]/g, '').length !== 8}
      />
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
