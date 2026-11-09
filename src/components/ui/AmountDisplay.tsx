// src/components/ui/AmountDisplay.tsx
import React from 'react';
import { Text, type TextStyle } from 'react-native';
import { Colors } from '../../constants/theme';
import { formatRupiah } from '../../lib/currency';

type AmountDisplayProps = {
  amount: number;
  type?: 'income' | 'expense' | 'neutral';
  showSign?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  style?: TextStyle;
};

export const AmountDisplay: React.FC<AmountDisplayProps> = ({
  amount,
  type = 'neutral',
  showSign = false,
  size = 'md',
  style,
}) => {
  let textColor: string = Colors.light.text;
  if (type === 'income') textColor = '#059669';
  if (type === 'expense') textColor = '#E11D48';

  let fontSize = 16;
  let fontWeight: '600' | '700' = '600';

  if (size === 'sm') {
    fontSize = 13;
    fontWeight = '600';
  } else if (size === 'md') {
    fontSize = 15;
    fontWeight = '700';
  } else if (size === 'lg') {
    fontSize = 20;
    fontWeight = '700';
  } else if (size === 'hero') {
    fontSize = 28;
    fontWeight = '700';
  }

  let sign = '';
  if (showSign && amount > 0) {
    if (type === 'income') sign = '+';
    else if (type === 'expense') sign = '-';
  }

  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[{ color: textColor, fontSize, fontWeight }, style]}
    >
      {sign}
      {formatRupiah(amount)}
    </Text>
  );
};
