export type ItemCategory = 'Chicken Tikka' | 'Boneless Thigh' | 'Chicken Wings' | 'Whole Chicken' | 'Leg Pieces' | 'Liver/Gizzard' | 'Other';

export interface DeliveryItem {
  id: string;
  category: ItemCategory | string;
  weight: number;
  rate: number;
  total: number;
}

export interface Delivery {
  id: string;
  type: 'delivery';
  date: string; // YYYY-MM-DD
  items: DeliveryItem[];
  totalBill: number;
  createdAt: number;
}

export interface PurchasePayment {
  id: string;
  type: 'payment';
  date: string; // YYYY-MM-DD
  amount: number;
  note: string;
  createdAt: number;
}

export type Transaction = Delivery | PurchasePayment;

export interface Supplier {
  id: string;
  name: string;
  password?: string;
  categories?: string[];
  createdAt: number;
}

export interface Formula {
  id: string;
  name: string;
  category: string;
  expression: string; // Internal representation, e.g. "sp + (v1 * v2)"
  variables: { name: string; label: string }[];
}
