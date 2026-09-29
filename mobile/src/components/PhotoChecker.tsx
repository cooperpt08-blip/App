import { useCallback, useMemo, useRef } from 'react';
import { View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { photoCheckPage, type PhotoCheckResult } from '@/lib/photoCheckPage';

type Pending = { resolve: (r: PhotoCheckResult) => void; timer: ReturnType<typeof setTimeout> };

// Checks photo quality on the phone with MediaPipe (see photoCheckPage.ts).
// Render {checker} once on the screen, then call check(). It never blocks the
// customer: if the checker can't run, it answers "not checked" and they carry on.
export function usePhotoChecker() {
  const web = useRef<WebView>(null);
  const pending = useRef(new Map<string, Pending>());
  const unavailable = useRef(false);
  const html = useMemo(() => photoCheckPage(), []);

  const finish = useCallback((id: string, result: PhotoCheckResult) => {
    const p = pending.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.current.delete(id);
    p.resolve(result);
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'unavailable') {
          unavailable.current = true;
          for (const id of [...pending.current.keys()]) finish(id, { checked: false, issues: [] });
        }
        if (msg.type === 'result') finish(msg.id, { checked: Boolean(msg.checked), issues: msg.issues ?? [] });
      } catch {
        // ignore anything that isn't ours
      }
    },
    [finish],
  );

  const check = useCallback(
    (base64: string, kind: 'front' | 'side') =>
      new Promise<PhotoCheckResult>((resolve) => {
        if (unavailable.current || !web.current) return resolve({ checked: false, issues: [] });
        const id = Math.random().toString(36).slice(2);
        const timer = setTimeout(() => finish(id, { checked: false, issues: [] }), 20000);
        pending.current.set(id, { resolve, timer });
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        web.current.injectJavaScript(
          `window.checkPhoto && window.checkPhoto(${JSON.stringify(id)}, ${JSON.stringify(dataUrl)}, ${JSON.stringify(kind)}); true;`,
        );
      }),
    [finish],
  );

  const checker = (
    <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }} pointerEvents="none">
      <WebView
        ref={web}
        source={{ html, baseUrl: 'https://cdn.jsdelivr.net/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={onMessage}
        onError={() => (unavailable.current = true)}
      />
    </View>
  );

  return { checker, check };
}
