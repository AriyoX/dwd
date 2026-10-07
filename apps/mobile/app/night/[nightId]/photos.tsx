import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { getNightPhotos } from '@dwd/data';
import { Action, PrimaryButton } from '@/components/primary-button';
import {
  LoadingPanel,
  Notice,
  Panel,
  RetryPanel,
  Screen,
  ScreenHeading,
} from '@/components/screen';
import { useAccountQuery } from '@/hooks/use-account-query';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { photoClient } from '@/lib/photo-client';
import { photoFile, preparePhoto, removeLocalPhoto } from '@/lib/photo-files';
import {
  discardPhotoTask,
  photoObjectPath,
  photoSlots,
  photoTaskKey,
  readPhotoTask,
  removePhoto,
  savePhotoTask,
  type PhotoTask,
} from '@/lib/photo-upload';
import { withRequestTimeout } from '@/lib/request-timeout';
import { confirmAction } from '@/lib/confirm';

export default function PhotosScreen() {
  const { nightId } = useLocalSearchParams<{ nightId: string }>();
  const { session } = useSupabase();
  return session ? (
    <Memories key={`${session.user.id}:${nightId}`} owner={session.user.id} nightId={nightId} />
  ) : null;
}
function Memories({ owner, nightId }: { owner: string; nightId: string }) {
  const router = useRouter();
  const { session } = useSupabase();
  const token = session?.access_token;
  const { colors, typography } = useTheme();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const alive = useRef(true);
  const stillMounted = () => alive.current;
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    if (!token) throw new Error('Sign in to see memories.');
    return withRequestTimeout(async (signal) => {
      const client = photoClient(token, signal);
      const photos = await getNightPhotos(client, nightId);
      if (!photos.length) return [];
      const { data, error } = await client.storage.from('night-memories').createSignedUrls(
        photos.map((p) => p.objectPath),
        60,
      );
      if (error) throw error;
      return photos.map((photo) => {
        const signed = data.find((value) => value.path === photo.objectPath);
        return { ...photo, url: signed?.signedUrl ?? null };
      });
    });
  }, [nightId, token]);
  const query = useAccountQuery(load, `photos:${nightId}`);
  const refresh = query.refresh;
  useFocusEffect(
    useCallback(() => {
      // Deletions may not generate a readable Realtime event. Renew links and
      // reconcile while visible, including changes made from the web app.
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') void refresh();
      }, 30_000);
      return () => clearInterval(timer);
    }, [refresh]),
  );
  const [restored] = useState(() => {
    try {
      return { task: readPhotoTask(globalThis.localStorage, owner, nightId), unreadable: false };
    } catch {
      return { task: null, unreadable: true };
    }
  });
  const [task, setTask] = useState<PhotoTask | null>(restored.task);
  const [unreadable, setUnreadable] = useState(restored.unreadable);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const photos = query.issue ? [] : (query.data ?? []);
  const viewed = photos.find((photo) => photo.id === viewing);
  function clearTask(value: PhotoTask) {
    globalThis.localStorage.removeItem(photoTaskKey(owner, nightId));
    try {
      removeLocalPhoto(value);
    } catch {
      /* Account deletion also clears the owned directory. */
    }
    if (alive.current) setTask(null);
  }
  async function run(label: string, work: () => Promise<void>) {
    if (inFlight.current || !token) return;
    inFlight.current = true;
    setBusy(label);
    setIssue(null);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      if (alive.current) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
        setIssue(
          code === '54000'
            ? 'You can save up to 2 photos per night. Remove an upload before adding another.'
            : "Couldn't upload your photo. Try again when you're online.",
        );
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function choose() {
    await run('Preparing photo', async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 1,
        exif: false,
      });
      if (picked.canceled || !picked.assets[0] || !alive.current) return;
      let prepared: PhotoTask;
      try {
        prepared = await preparePhoto(picked.assets[0].uri, {
          id: Crypto.randomUUID(),
          nightId,
          owner,
        });
      } catch {
        if (stillMounted())
          setIssue(
            'Could not prepare this photo. Choose a smaller image or check photo access in Settings.',
          );
        return;
      }
      if (!stillMounted()) {
        removeLocalPhoto(prepared);
        return;
      }
      try {
        globalThis.localStorage.setItem(photoTaskKey(owner, nightId), JSON.stringify(prepared));
      } catch {
        removeLocalPhoto(prepared);
        throw new Error('Device storage unavailable.');
      }
      setTask(prepared);
    });
  }
  async function upload(value: PhotoTask) {
    const accessToken = token;
    if (!accessToken) return;
    await run('Uploading photo', async () => {
      await withRequestTimeout(
        (signal) =>
          savePhotoTask(photoClient(accessToken, signal), value, () =>
            photoFile(value).arrayBuffer(),
          ),
        60_000,
      );
      if (!alive.current) return;
      clearTask(value);
      setNotice('Photo added.');
      await query.refresh();
    });
  }
  async function discard(id: string, path: string, pending?: PhotoTask) {
    const accessToken = token;
    if (!accessToken) return;
    if (
      inFlight.current ||
      !(await confirmAction(
        'Remove this photo?',
        'It will be removed for everyone in this night.',
        'Remove photo',
        true,
      )) ||
      !alive.current
    )
      return;
    await run('Removing photo', async () => {
      await withRequestTimeout((signal) =>
        pending
          ? discardPhotoTask(photoClient(accessToken, signal), pending)
          : removePhoto(photoClient(accessToken, signal), id, path),
      );
      if (!alive.current) return;
      if (pending) clearTask(pending);
      setViewing(null);
      setNotice('Photo removed.');
      await query.refresh();
    });
  }
  return (
    <Screen
      insetTop={false}
      refreshControl={
        <RefreshControl
          refreshing={query.loading}
          onRefresh={() => void query.refresh()}
          tintColor={colors.primary}
        />
      }
    >
      <ScreenHeading title="Memories" />
      <Notice message="Visible to everyone from this night. You can add 2 photos, up to 5 MB each." />
      {!query.data && query.loading ? <LoadingPanel /> : null}
      {query.issue ? <RetryPanel issue={query.issue} retry={() => void query.refresh()} /> : null}
      {unreadable ? (
        <Panel>
          <Notice
            error
            message="Could not restore the saved upload. It has been kept on this device."
          />
          <PrimaryButton
            label="Discard unreadable upload"
            variant="danger"
            onPress={() => {
              try {
                globalThis.localStorage.removeItem(photoTaskKey(owner, nightId));
                setUnreadable(false);
              } catch {
                setIssue("Couldn't clear this upload. Try again.");
              }
            }}
          />
        </Panel>
      ) : null}
      {task ? (
        <Panel>
          <Text style={typography.sectionTitle}>Your saved upload</Text>
          <Image
            source={{ uri: photoFile(task).uri }}
            accessibilityLabel="Photo ready to upload"
            style={{
              width: '100%',
              aspectRatio: 4 / 3,
              borderRadius: 16,
              backgroundColor: colors.surfaceSoft,
            }}
            resizeMode="cover"
          />
          <PrimaryButton
            label="Upload photo"
            icon="cloud-upload-outline"
            busy={busy === 'Uploading photo'}
            busyLabel="Uploading"
            disabled={Boolean(busy) || unreadable}
            onPress={() => void upload(task)}
          />
          <PrimaryButton
            label="Remove upload"
            variant="quiet"
            disabled={Boolean(busy)}
            onPress={() => void discard(task.id, photoObjectPath(task), task)}
          />
        </Panel>
      ) : !unreadable && query.data && !query.issue ? (
        <PrimaryButton
          label={photoSlots(photos, owner, null) ? 'Choose a photo' : 'Your 2 photos are saved'}
          icon="images-outline"
          variant="secondary"
          busy={busy === 'Preparing photo'}
          busyLabel="Preparing"
          disabled={Boolean(busy) || photoSlots(photos, owner, null) === 0}
          onPress={() => void choose()}
        />
      ) : null}
      {issue ? <Notice error message={issue} /> : null}
      {issue?.includes('Settings') ? (
        <PrimaryButton
          label="Open Settings"
          variant="quiet"
          onPress={() =>
            void Linking.openSettings().catch(() =>
              setIssue('Open your phone Settings and choose DWD to check photo access.'),
            )
          }
        />
      ) : null}
      {notice ? <Notice dismissible message={notice} /> : null}
      {busy === 'Removing photo' ? <Notice message="Removing photo…" /> : null}
      {query.data && !query.issue && !photos.length ? (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
          <Ionicons name="images-outline" size={40} color={colors.muted} accessible={false} />
          <Text style={typography.body}>No photos yet</Text>
        </View>
      ) : null}
      {photos
        .filter((photo) => photo.id !== task?.id)
        .map((photo) => (
          <Panel key={photo.id}>
            {photo.uploadedByUserId === owner && photo.moderationStatus !== 'approved' ? (
              <Notice
                message={
                  photo.moderationStatus === 'rejected'
                    ? 'This photo was not approved for sharing.'
                    : 'Only you can see this photo until it has been reviewed.'
                }
              />
            ) : null}
            <PrimaryButton
              label="Report photo or block uploader"
              variant="quiet"
              onPress={() =>
                router.push({
                  pathname: '/night/[nightId]/report',
                  params: {
                    nightId,
                    photoId: photo.id,
                    ...(photo.uploadedByUserId && photo.uploadedByUserId !== owner
                      ? { userId: photo.uploadedByUserId }
                      : {}),
                  },
                })
              }
            />
            <Action
              label={`View photo by ${photo.uploaderName}`}
              disabled={!photo.url || Boolean(busy)}
              onPress={() => {
                setBroken(null);
                setViewing(photo.id);
              }}
            >
              {photo.url ? (
                <MemoryPreview key={photo.url} uri={photo.url} />
              ) : (
                <Notice message="Photo unavailable. Pull down to retry." />
              )}
            </Action>
            <View style={{ gap: 3 }}>
              <Text style={{ ...typography.body, color: colors.text, fontWeight: '600' }}>
                {photo.uploaderName}
              </Text>
              <Text style={typography.body}>{new Date(photo.createdAt).toLocaleDateString()}</Text>
            </View>
            {photo.uploadedByUserId === owner ? (
              <PrimaryButton
                label="Delete your photo"
                variant="danger"
                disabled={Boolean(busy)}
                onPress={() => void discard(photo.id, photo.objectPath)}
              />
            ) : null}
          </Panel>
        ))}
      <Modal
        visible={Boolean(viewed)}
        transparent={false}
        animationType={reduced ? 'none' : 'fade'}
        onRequestClose={() => setViewing(null)}
      >
        <SafeAreaView
          accessibilityViewIsModal
          style={{ flex: 1, backgroundColor: colors.background }}
        >
          <View style={{ paddingHorizontal: 22, paddingVertical: 12 }}>
            <PrimaryButton
              label="Close photo"
              variant="quiet"
              icon="close-outline"
              onPress={() => setViewing(null)}
            />
          </View>
          {viewed?.url ? (
            <ScrollView
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            >
              <Image
                source={{ uri: viewed.url }}
                accessibilityLabel={`Photo by ${viewed.uploaderName}`}
                resizeMode="contain"
                onError={() => setBroken(viewed.id)}
                style={{ width, height: Math.max(160, height - 260) }}
              />
            </ScrollView>
          ) : null}
          <View style={{ padding: 22, gap: 12 }}>
            <Text style={typography.body}>{viewed?.uploaderName}</Text>
            {broken === viewed?.id ? (
              <PrimaryButton
                label="Reload photo"
                variant="secondary"
                onPress={() => {
                  setBroken(null);
                  void query.refresh();
                }}
              />
            ) : null}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="Previous"
                  variant="secondary"
                  disabled={!viewed || photos.indexOf(viewed) === 0}
                  onPress={() => {
                    if (!viewed) return;
                    setBroken(null);
                    setViewing(photos[photos.indexOf(viewed) - 1]?.id ?? null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="Next"
                  variant="secondary"
                  disabled={!viewed || photos.indexOf(viewed) === photos.length - 1}
                  onPress={() => {
                    if (!viewed) return;
                    setBroken(null);
                    setViewing(photos[photos.indexOf(viewed) + 1]?.id ?? null);
                  }}
                />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

function MemoryPreview({ uri }: { uri: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Notice message="Preview unavailable. Tap to open the photo, or pull down to retry." />
  ) : (
    <Image
      source={{ uri }}
      accessible={false}
      resizeMode="cover"
      onError={() => setFailed(true)}
      style={{
        width: '100%',
        aspectRatio: 4 / 3,
        borderRadius: 16,
        backgroundColor: colors.surfaceSoft,
      }}
    />
  );
}
