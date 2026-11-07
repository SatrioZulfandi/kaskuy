// src/components/ui/Icon.tsx
import { Image } from 'expo-image';
import React from 'react';
import { UIManager } from 'react-native';

let SvgModule: any = null;
try {
  const hasSvgNative = !!(
    UIManager.getViewManagerConfig('RNSVGSvgView') ||
    UIManager.getViewManagerConfig('RNSVGPath')
  );
  if (hasSvgNative) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SvgModule = require('react-native-svg');
  }
} catch {
  SvgModule = null;
}

export type IconName =
  | 'home'
  | 'home-fill'
  | 'wallet'
  | 'wallet-fill'
  | 'chart'
  | 'chart-fill'
  | 'settings'
  | 'settings-fill'
  | 'scan'
  | 'food'
  | 'shop'
  | 'entertainment'
  | 'transport'
  | 'bill'
  | 'health'
  | 'education'
  | 'salary'
  | 'business'
  | 'freelance'
  | 'savings'
  | 'gift'
  | 'other'
  | 'cash'
  | 'bank'
  | 'phone'
  | 'creditCard'
  | 'arrowUp'
  | 'arrowDown'
  | 'chevLeft'
  | 'chevRight'
  | 'chevDown'
  | 'search'
  | 'filter'
  | 'eye'
  | 'plus'
  | 'close'
  | 'camera'
  | 'check';

type IconProps = {
  name: IconName | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

// Pure, fast base64 encoder without native dependencies
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

function getSvgMarkup(name: string, color: string, strokeWidth: number): string {
  switch (name) {
    // Nav Bar Icons (Exact match with reference image)
    case 'home':
    case 'home-fill':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 20V10.5z"/>
        <path d="M9 21.5V13a1 1 0 011-1h4a1 1 0 011 1v8.5"/>
      </svg>`;

    case 'wallet':
    case 'wallet-fill':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="6" width="18" height="14" rx="2.5"/>
        <path d="M7 6V4.5a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0117 4.5V6"/>
        <path d="M16 11h4a1 1 0 011 1v2a1 1 0 01-1 1h-4z"/>
        <circle cx="18" cy="13" r="0.8" fill="${color}"/>
      </svg>`;

    case 'chart':
    case 'chart-fill':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth + 0.4}" stroke-linecap="round">
        <line x1="6" y1="20" x2="6" y2="14"/>
        <line x1="12" y1="20" x2="12" y2="6"/>
        <line x1="18" y1="20" x2="18" y2="10"/>
      </svg>`;

    case 'settings':
    case 'settings-fill':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round">
        <line x1="4" y1="8" x2="13" y2="8"/>
        <line x1="19" y1="8" x2="20" y2="8"/>
        <circle cx="16" cy="8" r="2.5"/>
        <line x1="4" y1="16" x2="5" y2="16"/>
        <line x1="11" y1="16" x2="20" y2="16"/>
        <circle cx="8" cy="16" r="2.5"/>
      </svg>`;

    case 'scan':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 9V7a2 2 0 012-2h2"/>
        <path d="M15 5h2a2 2 0 012 2v2"/>
        <path d="M5 15v2a2 2 0 002 2h2"/>
        <path d="M15 19h2a2 2 0 002-2v-2"/>
        <line x1="7" y1="12" x2="17" y2="12"/>
      </svg>`;

    // Categories
    case 'food':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h18"/><path d="M4 14c0-4 3.5-7 8-7s8 3 8 7"/><path d="M5 14v3a2 2 0 002 2h10a2 2 0 002-2v-3"/><path d="M12 3v4"/></svg>`;
    case 'shop':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg>`;
    case 'entertainment':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,8 16,12 10,16"/></svg>`;
    case 'transport':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14V6a2 2 0 00-2-2H7a2 2 0 00-2 2v11z"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/><path d="M5 13h14"/></svg>`;
    case 'bill':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16l-2-1.5L16 20l-2-1.5L12 20l-2-1.5L8 20l-2-1.5L4 20V4z"/><path d="M8 8h8"/><path d="M8 12h6"/></svg>`;
    case 'health':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
    case 'education':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L1 9l11 6 9-4.91V17"/><path d="M5 13.18v4L12 21l7-3.82v-4"/></svg>`;
    case 'other':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>`;
    case 'salary':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M2 8h2M20 8h2M2 16h2M20 16h2"/></svg>`;
    case 'business':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 11h18"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
    case 'freelance':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 22h10"/><path d="M12 18v4"/><path d="M8 10l3 2-3 2"/><path d="M14 14h3"/></svg>`;
    case 'savings':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/><path d="M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2"/><path d="M12 11v4"/><path d="M10 13h4"/></svg>`;
    case 'gift':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/><path d="M7.5 8C6.12 8 5 6.88 5 5.5S6.12 3 7.5 3c1.93 0 3.5 2.24 4.5 5-1-2.76-2.57-5-4.5-5z"/><path d="M16.5 8C17.88 8 19 6.88 19 5.5S17.88 3 16.5 3c-1.93 0-3.5 2.24-4.5 5 1-2.76 2.57-5 4.5-5z"/></svg>`;

    // Wallets & UI
    case 'cash':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M2 9h1M21 9h1M2 15h1M21 15h1"/></svg>`;
    case 'bank':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M12 3l9 7H3l9-7zM5 10v9M9 10v9M15 10v9M19 10v9"/></svg>`;
    case 'phone':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="18" r="0.8" fill="${color}" stroke="none"/></svg>`;
    case 'creditCard':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>`;

    case 'arrowUp':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth + 0.6}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
    case 'arrowDown':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth + 0.6}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`;
    case 'chevLeft':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
    case 'chevRight':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
    case 'chevDown':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;

    case 'search':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`;
    case 'filter':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>`;
    case 'eye':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    case 'plus':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth + 0.6}" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
    case 'close':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    case 'camera':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
    case 'check':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth + 0.6}" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;

    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}"><circle cx="12" cy="12" r="9"/></svg>`;
  }
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 22,
  color = '#1A1A2E',
  strokeWidth = 1.8,
}) => {
  // If native react-native-svg is available in compiled build, render via native SVG components
  if (SvgModule) {
    const { Svg, Circle, Line, Path, Rect } = SvgModule;

    switch (name) {
      case 'home':
      case 'home-fill':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
              d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 20V10.5z"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M9 21.5V13a1 1 0 011-1h4a1 1 0 011 1v8.5"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        );

      case 'wallet':
      case 'wallet-fill':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Rect
              x="3"
              y="6"
              width="18"
              height="14"
              rx="2.5"
              stroke={color}
              strokeWidth={strokeWidth}
            />
            <Path
              d="M7 6V4.5a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0117 4.5V6"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <Path
              d="M16 11h4a1 1 0 011 1v2a1 1 0 01-1 1h-4z"
              stroke={color}
              strokeWidth={strokeWidth}
            />
            <Circle cx="18" cy="13" r="0.8" fill={color} />
          </Svg>
        );

      case 'chart':
      case 'chart-fill':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Line
              x1="6"
              y1="20"
              x2="6"
              y2="14"
              stroke={color}
              strokeWidth={strokeWidth + 0.4}
              strokeLinecap="round"
            />
            <Line
              x1="12"
              y1="20"
              x2="12"
              y2="6"
              stroke={color}
              strokeWidth={strokeWidth + 0.4}
              strokeLinecap="round"
            />
            <Line
              x1="18"
              y1="20"
              x2="18"
              y2="10"
              stroke={color}
              strokeWidth={strokeWidth + 0.4}
              strokeLinecap="round"
            />
          </Svg>
        );

      case 'settings':
      case 'settings-fill':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Line
              x1="4"
              y1="8"
              x2="13"
              y2="8"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <Line
              x1="19"
              y1="8"
              x2="20"
              y2="8"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <Circle cx="16" cy="8" r="2.5" stroke={color} strokeWidth={strokeWidth} />
            <Line
              x1="4"
              y1="16"
              x2="5"
              y2="16"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <Line
              x1="11"
              y1="16"
              x2="20"
              y2="16"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <Circle cx="8" cy="16" r="2.5" stroke={color} strokeWidth={strokeWidth} />
          </Svg>
        );

      case 'scan':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
              d="M5 9V7a2 2 0 012-2h2"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M15 5h2a2 2 0 012 2v2"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M5 15v2a2 2 0 002 2h2"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M15 19h2a2 2 0 002-2v-2"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              x1="7"
              y1="12"
              x2="17"
              y2="12"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          </Svg>
        );

      default:
        break;
    }
  }

  // Base64 Data URI for expo-image (Glide Base64DataFetcher requires base64)
  const svgXml = getSvgMarkup(name, color, strokeWidth);
  const base64Data = toBase64(svgXml);
  const uri = `data:image/svg+xml;base64,${base64Data}`;

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      contentFit="contain"
      recyclingKey={`${name}-${color}-${size}-${strokeWidth}`}
    />
  );
};
