import { useCallback, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { HOUSE_BANNERS, loadBannerAds, type BannerAd } from '@/lib/banner-ads';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';
import { Notice } from './screen';

const GAP = 12;
const palette = {
  plum: { background: '#482039', accent: '#E9B8CD', text: '#FFF5FA' },
  blue: { background: '#252F4C', accent: '#BCCDF7', text: '#F5F7FF' },
  amber: { background: '#493522', accent: '#F2CC94', text: '#FFF8ED' },
};

export function TonightBanners() {
  const router = useRouter();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [ads, setAds] = useState(HOUSE_BANNERS);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);
  const [issue, setIssue] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const cardWidth = Math.max(1, width - 28);
  const interval = cardWidth + GAP;

  useFocusEffect(
    useCallback(() => {
      const feedUrl = process.env.EXPO_PUBLIC_DWD_ADS_URL;
      if (!feedUrl) return;
      const controller = new AbortController();
      const replaceAds = (next: BannerAd[]) => {
        setAds(next);
        setActive(0);
        setIssue(null);
        scroll.current?.scrollTo({ x: 0, animated: false });
      };
      const timeout = setTimeout(() => {
        replaceAds(HOUSE_BANNERS);
        controller.abort();
      }, 6000);
      void loadBannerAds(feedUrl, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          replaceAds(next ?? HOUSE_BANNERS);
        })
        .catch(() => {
          // Ad delivery must never interrupt starting or joining a night.
          if (!controller.signal.aborted) replaceAds(HOUSE_BANNERS);
        })
        .finally(() => clearTimeout(timeout));
      return () => {
        controller.abort();
        clearTimeout(timeout);
      };
    }, []),
  );

  if (!ads.length) return null;
  return (
    <View
      style={{ gap: 10 }}
      onLayout={({ nativeEvent }) => {
        if (nativeEvent.layout.width === width) return;
        setWidth(nativeEvent.layout.width);
        setActive(0);
        scroll.current?.scrollTo({ x: 0, animated: false });
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}
      >
        Featured
      </Text>
      {width > 0 ? (
        <ScrollView
          ref={scroll}
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          snapToInterval={interval}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          contentContainerStyle={{ gap: GAP, paddingRight: 28 }}
          onScrollEndDrag={({ nativeEvent }) =>
            setActive(
              Math.min(
                ads.length - 1,
                Math.max(0, Math.round(nativeEvent.contentOffset.x / interval)),
              ),
            )
          }
          onMomentumScrollEnd={({ nativeEvent }) =>
            setActive(
              Math.min(
                ads.length - 1,
                Math.max(0, Math.round(nativeEvent.contentOffset.x / interval)),
              ),
            )
          }
        >
          {ads.map((ad, index) => (
            <BannerCard
              key={`${ad.id}:${ad.imageUrl ?? ''}`}
              ad={ad}
              width={cardWidth}
              position={`${index + 1} of ${ads.length}`}
              onPress={() => {
                setIssue(null);
                if (ad.route) router.push(ad.route);
                else if (ad.url)
                  void Linking.openURL(ad.url).catch(() =>
                    setIssue('Could not open this link. Try again.'),
                  );
              }}
            />
          ))}
        </ScrollView>
      ) : null}
      {ads.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          {ads.map((ad, index) => (
            <Pressable
              key={ad.id}
              accessibilityRole="button"
              accessibilityLabel={`Show banner ${index + 1} of ${ads.length}`}
              accessibilityState={{ selected: active === index }}
              onPress={() => {
                scroll.current?.scrollTo({ x: index * interval, animated: !reducedMotion });
                setActive(index);
              }}
              style={{
                minWidth: 40,
                minHeight: 40,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  height: 6,
                  width: active === index ? 18 : 6,
                  borderRadius: 3,
                  backgroundColor: active === index ? colors.primary : colors.border,
                }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
      {issue ? <Notice error message={issue} /> : null}
    </View>
  );
}

function BannerCard({
  ad,
  width,
  position,
  onPress,
}: {
  ad: BannerAd;
  width: number;
  position: string;
  onPress: () => void;
}) {
  const tone = palette[ad.tone];
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(ad.imageUrl) && !imageFailed;
  return (
    <Action
      label={`${ad.sponsored ? `Sponsored by ${ad.advertiser}` : ad.advertiser}. ${ad.title}. ${ad.cta}. Banner ${position}`}
      onPress={onPress}
      containerStyle={{ width }}
      style={{
        minHeight: 152,
        padding: 18,
        borderRadius: 20,
        backgroundColor: tone.background,
        overflow: 'hidden',
        gap: 12,
      }}
    >
      {hasImage ? (
        <>
          <Image
            key={ad.imageUrl}
            source={{ uri: ad.imageUrl }}
            resizeMode="cover"
            accessible={false}
            onError={() => setImageFailed(true)}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.68)',
            }}
          />
        </>
      ) : (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: -20,
            bottom: -32,
            width: 156,
            height: 156,
            borderRadius: 78,
            borderWidth: 24,
            borderColor: `${tone.accent}18`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={ad.sponsored ? 'megaphone-outline' : 'moon-outline'}
            color={`${tone.accent}55`}
            size={54}
            accessible={false}
          />
        </View>
      )}
      <Text style={{ color: tone.text, fontSize: 11, lineHeight: 16, fontWeight: '600' }}>
        {ad.sponsored ? `Sponsored · ${ad.advertiser}` : ad.advertiser}
      </Text>
      <Text
        style={{
          color: tone.text,
          fontSize: 22,
          lineHeight: 27,
          letterSpacing: -0.5,
          fontWeight: '700',
          maxWidth: '90%',
        }}
      >
        {ad.title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <Text
          style={{ color: hasImage ? tone.text : tone.accent, fontSize: 13, fontWeight: '600' }}
        >
          {ad.cta}
        </Text>
        <Ionicons
          name="arrow-forward"
          size={16}
          color={hasImage ? tone.text : tone.accent}
          accessible={false}
        />
      </View>
    </Action>
  );
}
