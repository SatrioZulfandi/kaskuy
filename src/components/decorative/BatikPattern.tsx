// src/components/decorative/BatikPattern.tsx
import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type BatikPatternProps = {
  opacity?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(str: string): string {
  const utf8Bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 128) {
      utf8Bytes.push(c);
    } else if (c < 2048) {
      utf8Bytes.push(192 | (c >> 6), 128 | (c & 63));
    } else if (c < 55296 || c >= 57344) {
      utf8Bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    } else {
      i++;
      c = 65536 + (((c & 1023) << 10) | (str.charCodeAt(i) & 1023));
      utf8Bytes.push(
        240 | (c >> 18),
        128 | ((c >> 12) & 63),
        128 | ((c >> 6) & 63),
        128 | (c & 63)
      );
    }
  }

  let result = '';
  let i = 0;
  while (i < utf8Bytes.length) {
    const b0 = utf8Bytes[i++];
    const b1 = i < utf8Bytes.length ? utf8Bytes[i++] : NaN;
    const b2 = i < utf8Bytes.length ? utf8Bytes[i++] : NaN;

    const e0 = b0 >> 2;
    const e1 = ((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4);
    const e2 = isNaN(b1) ? 64 : ((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6);
    const e3 = isNaN(b2) ? 64 : b2 & 63;

    result +=
      B64_CHARS.charAt(e0) +
      B64_CHARS.charAt(e1) +
      (e2 === 64 ? '=' : B64_CHARS.charAt(e2)) +
      (e3 === 64 ? '=' : B64_CHARS.charAt(e3));
  }
  return result;
}

const svgCache: Record<string, string> = {};

function getBatikKawungDataUri(color: string): string {
  if (svgCache[color]) {
    return svgCache[color];
  }

  const cols = 7;
  const rows = 4;
  const tile = 60;
  const width = cols * tile;
  const height = rows * tile;

  const elements: string[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = c * tile;
      const oy = r * tile;
      const cx = ox + 30;
      const cy = oy + 30;

      // Outer Ceplok circle ring
      elements.push(
        `<circle cx="${cx}" cy="${cy}" r="28" stroke="${color}" stroke-width="1.2" fill="none"/>`
      );

      // 4 Kawung diagonal petals (kolang-kaling) + inner cocohan dots
      elements.push(
        `<ellipse cx="${ox + 15}" cy="${oy + 15}" rx="6.5" ry="13.5" transform="rotate(-45 ${ox + 15} ${oy + 15})" stroke="${color}" stroke-width="1.35" fill="none"/>`,
        `<circle cx="${ox + 15}" cy="${oy + 15}" r="1.6" fill="${color}" stroke="none"/>`,
        `<ellipse cx="${ox + 45}" cy="${oy + 15}" rx="6.5" ry="13.5" transform="rotate(45 ${ox + 45} ${oy + 15})" stroke="${color}" stroke-width="1.35" fill="none"/>`,
        `<circle cx="${ox + 45}" cy="${oy + 15}" r="1.6" fill="${color}" stroke="none"/>`,
        `<ellipse cx="${ox + 15}" cy="${oy + 45}" rx="6.5" ry="13.5" transform="rotate(45 ${ox + 15} ${oy + 45})" stroke="${color}" stroke-width="1.35" fill="none"/>`,
        `<circle cx="${ox + 15}" cy="${oy + 45}" r="1.6" fill="${color}" stroke="none"/>`,
        `<ellipse cx="${ox + 45}" cy="${oy + 45}" rx="6.5" ry="13.5" transform="rotate(-45 ${ox + 45} ${oy + 45})" stroke="${color}" stroke-width="1.35" fill="none"/>`,
        `<circle cx="${ox + 45}" cy="${oy + 45}" r="1.6" fill="${color}" stroke="none"/>`
      );

      // Center Ceplok diamond star
      elements.push(
        `<polygon points="${cx},${cy - 4.2} ${cx + 4.2},${cy} ${cx},${cy + 4.2} ${cx - 4.2},${cy}" fill="${color}" stroke="none"/>`
      );

      // Corner intersection dot
      elements.push(
        `<circle cx="${ox}" cy="${oy}" r="2.2" fill="${color}" stroke="none"/>`
      );
    }
  }

  const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${elements.join('')}</svg>`;
  const uri = `data:image/svg+xml;base64,${toBase64(svgXml)}`;
  svgCache[color] = uri;
  return uri;
}

/**
 * Geometric Indonesian Batik Kawung/Ceplok overlay for balance cards and empty states.
 * Rendered via expo-image Base64 SVG Data URI so it works across all Android builds without native recompilation.
 */
export const BatikPattern: React.FC<BatikPatternProps> = ({
  opacity = 0.12,
  color = '#FFFFFF',
  style,
}) => {
  const uri = useMemo(() => getBatikKawungDataUri(color), [color]);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.container, { opacity }, style]}
      pointerEvents="none"
    >
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={`batik-kawung-${color}`}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
