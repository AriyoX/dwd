import { Image, StyleSheet, View } from 'react-native';
import dwdMark from '../../assets/dwd-mark.png';

export function Brand() {
  return (
    <View style={styles.row}>
      <Image
        accessible
        accessibilityLabel="dwd, Drink with Desire"
        accessibilityRole="image"
        source={dwdMark}
        resizeMode="contain"
        style={styles.mark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 60, justifyContent: 'center', alignItems: 'flex-start' },
  mark: { width: 104, height: 42 },
});
