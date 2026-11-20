import { requireOptionalNativeModule, type PermissionResponse } from 'expo';
import type { CameraView } from 'expo-camera';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../../constants/theme';
import { useTopInset } from '../../hooks/useTopInset';
import { Icon } from '../ui/Icon';

type ReceiptCameraProps = {
  active: boolean;
  onCapture: (uri: string) => void | Promise<void>;
  onGallery: () => void | Promise<void>;
  onClose: () => void;
  onSystemCamera?: () => void | Promise<void>;
};

type CameraModule = typeof import('expo-camera');
type CameraAction = 'capture' | 'photo' | 'external' | 'permission';

const white = Colors.light.surface;
const previewDim = 'rgba(8, 18, 34, 0.76)';

function inForeground() {
  return AppState.currentState == null || AppState.currentState === 'active';
}

export function ReceiptCamera({
  active,
  onCapture,
  onGallery,
  onClose,
  onSystemCamera,
}: ReceiptCameraProps) {
  const topInset = useTopInset(12);
  const { bottom } = useSafeAreaInsets();
  const [foreground, setForeground] = useState(inForeground);
  const [cameraSource, setCameraSource] = useState<CameraModule | 'missing' | null>();
  const [permission, setPermission] = useState<PermissionResponse | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [action, setAction] = useState<CameraAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const camera = useRef<CameraView | null>(null);
  const mounted = useRef(false);
  const focused = useRef(false);
  const prompted = useRef(false);
  const locked = useRef(false);
  const usedExternalPicker = useRef(false);
  const cameraModule = cameraSource === 'missing' ? null : cameraSource;

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    focused.current = active;
    return () => {
      focused.current = false;
    };
  }, [active]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') setPermission(null);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!active) return;
    let subscribed = true;
    async function loadCamera() {
      try {
        // Older KASKUY development APKs can still use ImagePicker's system camera.
        const cameraAvailable = Platform.OS === 'web' || requireOptionalNativeModule('ExpoCamera');
        const module = cameraAvailable ? await import('expo-camera') : 'missing';
        if (subscribed) setCameraSource(module);
      } catch {
        if (subscribed) setCameraSource(null);
      }
    }
    void loadCamera();
    return () => {
      subscribed = false;
    };
  }, [active]);

  useEffect(() => {
    if (!cameraModule || !active || !foreground) return;
    let subscribed = true;
    async function refreshPermission(module: CameraModule) {
      try {
        let result = await module.Camera.getCameraPermissionsAsync();
        if (!subscribed) return;
        if (
          Platform.OS !== 'web' && !result.granted && result.canAskAgain &&
          !prompted.current && !locked.current && inForeground()
        ) {
          prompted.current = true;
          result = await module.Camera.requestCameraPermissionsAsync();
        }
        if (subscribed) setPermission(result);
      } catch {
        if (subscribed) setCameraSource(null);
      }
    }
    void refreshPermission(cameraModule);
    return () => {
      subscribed = false;
    };
  }, [active, cameraModule, foreground]);

  const attachCamera = useCallback((instance: CameraView | null) => {
    camera.current = instance;
    if (!instance) setReady(false);
  }, []);

  const perform = useCallback(async (nextAction: CameraAction, task: () => Promise<void>, errorMessage: string) => {
    if (!active || locked.current) return;
    locked.current = true;
    setMessage(null);
    setAction(nextAction);
    try {
      await task();
    } catch {
      if (mounted.current && focused.current) setMessage(errorMessage);
    } finally {
      locked.current = false;
      if (mounted.current) setAction(null);
    }
  }, [active]);

  const openExternal = useCallback((open: () => void | Promise<void>, errorMessage: string) => {
    const mustReleasePreview = camera.current !== null;
    void perform('external', async () => {
      usedExternalPicker.current = true;
      if (mustReleasePreview) {
        // Allow the unmounted preview to release its Android camera surface.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      if (mounted.current && focused.current && inForeground()) await open();
    }, errorMessage);
  }, [perform]);

  useEffect(() => {
    if (cameraSource !== 'missing' || !active || !foreground || !onSystemCamera || usedExternalPicker.current) return;
    // Finish opening the scan route before presenting the legacy Android picker.
    const timer = setTimeout(() => {
      if (!usedExternalPicker.current && focused.current && inForeground()) {
        openExternal(onSystemCamera, 'Kamera sistem gagal dibuka.');
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [active, cameraSource, foreground, onSystemCamera, openExternal]);

  const requestPermission = () => {
    if (!cameraModule || !permission) return;
    void perform('permission', async () => {
      if (!permission.canAskAgain) {
        await Linking.openSettings();
        return;
      }
      const result = await cameraModule.Camera.requestCameraPermissionsAsync();
      if (mounted.current) setPermission(result);
    }, 'Izin kamera belum bisa diperbarui.');
  };

  const capture = () => {
    if (!ready || !camera.current) return;
    const instance = camera.current;
    void perform('capture', async () => {
      const photo = await instance.takePictureAsync({
        quality: 1,
        skipProcessing: false,
        shutterSound: false,
      });
      if (!mounted.current || !focused.current || !inForeground() || camera.current !== instance) return;
      if (!photo?.uri || photo.width <= 0 || photo.height <= 0) {
        throw new Error('Foto kamera kosong.');
      }
      setAction('photo');
      await onCapture(photo.uri);
    }, 'Foto gagal diambil. Coba lagi.');
  };

  const CameraPreview = cameraModule?.CameraView;
  const showPreview = Boolean(
    CameraPreview && active && foreground && permission?.granted && !previewFailed &&
    action !== 'external' && action !== 'photo',
  );
  const busy = action !== null;
  const shutterDisabled = !showPreview || !ready || busy;
  const loading = cameraModule === undefined || (cameraModule !== null && permission === null);
  const showSystemCamera = Boolean(onSystemCamera && (cameraModule === null || previewFailed));

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      {showPreview && CameraPreview && (
        <CameraPreview
          ref={attachCamera}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          onCameraReady={() => {
            if (camera.current) setReady(true);
          }}
          onMountError={() => {
            if (camera.current) setPreviewFailed(true);
          }}
        />
      )}

      <View style={[styles.header, { paddingTop: topInset }]}>
        <Pressable
          accessibilityLabel="Tutup kamera"
          accessibilityRole="button"
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          onPress={() => {
            focused.current = false;
            onClose();
          }}
        >
          <Icon name="close" color={white} size={24} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>Scan struk</Text>
        <View style={styles.headerSpacer} />
      </View>

      {showPreview ? (
        <View pointerEvents="none" style={styles.middle}>
          <View style={styles.guide}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <Text style={styles.hint}>Posisikan struk di dalam bingkai</Text>
        </View>
      ) : (
        <View style={styles.middle}>
          {loading || busy ? (
            <ActivityIndicator color={white} size="small" accessibilityLabel="Menyiapkan kamera" />
          ) : (
            <>
              <Text style={styles.title}>
                {cameraModule === null || previewFailed ? 'Kamera belum tersedia' : 'Izinkan akses kamera'}
              </Text>
              {cameraModule && !permission?.granted ? (
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                  onPress={requestPermission}
                >
                  <Text style={styles.buttonText}>{permission?.canAskAgain ? 'Izinkan kamera' : 'Buka pengaturan'}</Text>
                </Pressable>
              ) : previewFailed && (
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                  onPress={() => setPreviewFailed(false)}
                >
                  <Text style={styles.buttonText}>Coba lagi</Text>
                </Pressable>
              )}
              {showSystemCamera && onSystemCamera && (
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                  onPress={() => openExternal(onSystemCamera, 'Kamera sistem gagal dibuka.')}
                >
                  <Text style={styles.buttonText}>Buka kamera sistem</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}

      <View style={[styles.controls, { paddingBottom: Math.max(bottom, Spacing.md) }]}>
        {message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
        <View style={styles.controlRow}>
          <View style={styles.sideControl}>
            <Pressable
              accessibilityLabel="Pilih foto dari galeri"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              style={({ pressed }) => [styles.gallery, pressed && styles.pressed, busy && styles.disabled]}
              onPress={() => openExternal(onGallery, 'Galeri gagal dibuka. Coba lagi.')}
            >
              <Text style={styles.buttonText}>Galeri</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel="Ambil foto"
            accessibilityRole="button"
            accessibilityState={{ disabled: shutterDisabled, busy: action === 'capture' }}
            disabled={shutterDisabled}
            onPress={capture}
            style={({ pressed }) => [
              styles.shutter,
              shutterDisabled && action !== 'capture' && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {action === 'capture'
              ? <ActivityIndicator color={white} size="small" />
              : <View style={styles.shutterCenter} />}
          </Pressable>
          <View style={styles.sideControl} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: previewDim,
  },
  title: { ...Typography.title, color: white, textAlign: 'center' },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radius.full,
  },
  headerSpacer: { width: 48 },
  middle: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    gap: Spacing.lg,
  },
  guide: { width: '82%', maxWidth: 360, aspectRatio: 0.72, maxHeight: '76%' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: white },
  topLeft: { top: 0, left: 0, borderLeftWidth: 2, borderTopWidth: 2, borderTopLeftRadius: Radius.sm },
  topRight: { top: 0, right: 0, borderRightWidth: 2, borderTopWidth: 2, borderTopRightRadius: Radius.sm },
  bottomLeft: { bottom: 0, left: 0, borderLeftWidth: 2, borderBottomWidth: 2, borderBottomLeftRadius: Radius.sm },
  bottomRight: { bottom: 0, right: 0, borderRightWidth: 2, borderBottomWidth: 2, borderBottomRightRadius: Radius.sm },
  hint: {
    ...Typography.body,
    textAlign: 'center',
    color: white,
    backgroundColor: previewDim,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  controls: { paddingTop: Spacing.md, paddingHorizontal: Spacing.lg, backgroundColor: previewDim },
  controlRow: { flexDirection: 'row', alignItems: 'center' },
  sideControl: { flex: 1, alignItems: 'flex-start' },
  gallery: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    borderRadius: Radius.lg,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
  },
  buttonText: { ...Typography.subtitle, color: white, textAlign: 'center' },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCenter: { width: 58, height: 58, borderRadius: Radius.full, backgroundColor: white },
  secondaryAction: {
    backgroundColor: Colors.light.primaryDark,
    borderRadius: Radius.md,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  message: { ...Typography.body, color: white, textAlign: 'center', marginBottom: Spacing.sm },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.42 },
});
