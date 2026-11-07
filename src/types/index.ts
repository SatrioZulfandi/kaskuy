// src/types/index.ts

export type Book = {
  id: number;
  name: string;
  is_default: number; // 1 or 0
  created_at: string;
};

export type WalletType = 'cash' | 'bank' | 'ewallet' | 'credit_card';

export type Wallet = {
  id: number;
  book_id: number;
  name: string;
  type: WalletType;
  balance: number;
  icon: string;
  color: string;
  is_archived: number; // 1 or 0
  created_at: string;
};

export type CategoryType = 'income' | 'expense';

export type Category = {
  id: number;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  sort_order: number;
  is_default: number;
};

export type TransactionType = 'income' | 'expense';

export type Transaction = {
  id: number;
  book_id: number;
  wallet_id: number;
  category_id: number;
  type: TransactionType;
  amount: number;
  note: string | null;
  date: string; // YYYY-MM-DD
  scan_result_id?: number | null;
  created_at: string;
  updated_at: string;
};

// Joined transaction detail with wallet & category info
export type TransactionWithDetails = Transaction & {
  wallet_name: string;
  wallet_type: WalletType;
  category_name: string;
  category_icon: string;
  category_color: string;
};

export type Budget = {
  id: number;
  book_id: number;
  category_id: number;
  amount: number;
  month: string; // YYYY-MM
  created_at: string;
};

export type BudgetWithProgress = Budget & {
  category_name: string;
  category_icon: string;
  category_color: string;
  spent: number;
  remaining: number;
  percentage: number;
};

export type Confidence = 'high' | 'medium' | 'low';

export type ParsedReceiptData = {
  merchant: string | null;
  date: string | null;
  total: number | null;
  tunai: number | null;
  kembali: number | null;
  items?: { name: string; qty: number; price: number; total: number }[];
  notes?: string[];
};

export type ScanResult = {
  id: number;
  image_uri: string;
  raw_ocr_text: string;
  reconstructed_lines: string; // JSON string
  parsed_data: string; // JSON string of ParsedReceiptData
  confidence: Confidence;
  needs_confirmation: number; // 1 or 0
  was_corrected: number; // 1 or 0
  corrected_data: string | null; // JSON string
  ocr_duration_ms: number;
  created_at: string;
};

export type OcrCorrection = {
  id: number;
  scan_result_id: number;
  field: 'merchant' | 'total' | 'tunai' | 'kembali' | 'items' | 'date';
  original_value: string | null;
  corrected_value: string;
  created_at: string;
};

export type MerchantDictionaryEntry = {
  id: number;
  raw_text: string;
  normalized_name: string;
  frequency: number;
  created_at: string;
  updated_at: string;
};

export type PeriodFilter = 'Harian' | 'Mingguan' | 'Bulanan' | 'Tahunan';
