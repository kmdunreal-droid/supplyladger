import { pgTable, serial, text, timestamp, integer, numeric, jsonb, boolean, uuid, bigint } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users (Firebase Auth synchronized)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Suppliers
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  externalId: text('external_id').notNull().unique(), // e.g., sup-123
  userId: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  password: text('password'),
  categories: jsonb('categories').$type<string[]>(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Transactions
export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  externalId: text('external_id').notNull().unique(), // e.g., tx-123
  supplierId: integer('supplier_id').references(() => suppliers.id).notNull(),
  type: text('type', { enum: ['delivery', 'payment'] }).notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  amount: numeric('amount'), // Used for payments
  totalBill: numeric('total_bill'), // Used for deliveries
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Delivery Items
export const deliveryItems = pgTable('delivery_items', {
  id: serial('id').primaryKey(),
  transactionId: integer('transaction_id').references(() => transactions.id).notNull(),
  category: text('category').notNull(),
  weight: numeric('weight').notNull(),
  rate: numeric('rate').notNull(),
  total: numeric('total').notNull(),
});

// Rate Formulas
export const formulas = pgTable('formulas', {
  id: serial('id').primaryKey(),
  externalId: text('external_id').notNull().unique(),
  userId: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  expression: text('expression').notNull(),
  variables: jsonb('variables').$type<{ name: string; label: string }[]>(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  suppliers: many(suppliers),
  formulas: many(formulas),
}));

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  user: one(users, { fields: [suppliers.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [transactions.supplierId], references: [suppliers.id] }),
  items: many(deliveryItems),
}));

export const deliveryItemsRelations = relations(deliveryItems, ({ one }) => ({
  transaction: one(transactions, { fields: [deliveryItems.transactionId], references: [transactions.id] }),
}));

export const formulasRelations = relations(formulas, ({ one }) => ({
  user: one(users, { fields: [formulas.userId], references: [users.id] }),
}));
