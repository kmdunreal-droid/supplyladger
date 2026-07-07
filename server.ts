import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import * as dotenv from "dotenv";
import { db } from "./src/db/index.ts";
import { users, suppliers, transactions, formulas, deliveryItems } from "./src/db/schema.ts";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // User Registration / Sync
  app.post("/api/auth/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id, email } = req.user!;
      const result = await db.insert(users)
        .values({ uid: id, email: email || "" })
        .onConflictDoUpdate({
          target: users.uid,
          set: { email: email || "" }
        })
        .returning();
      res.json(result[0]);
    } catch (error) {
      console.error("Auth sync failed:", error);
      res.status(500).json({ error: "Failed to sync user" });
    }
  });

  // Suppliers
  app.get("/api/suppliers", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.uid, req.user!.id)
      });
      if (!user) return res.status(404).json({ error: "User not found" });

      const result = await db.query.suppliers.findMany({
        where: eq(suppliers.userId, user.id)
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/suppliers", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.uid, req.user!.id)
      });
      if (!user) return res.status(404).json({ error: "User not found" });

      const { suppliers: suppliersData } = req.body;
      const insertedSuppliers = [];
      for (const s of suppliersData) {
        const [result] = await db.insert(suppliers)
          .values({
            externalId: s.id,
            userId: user.id,
            name: s.name,
            password: s.password,
            categories: s.categories,
          })
          .onConflictDoUpdate({
            target: suppliers.externalId,
            set: {
              name: s.name,
              password: s.password,
              categories: s.categories,
            }
          })
          .returning();
        insertedSuppliers.push(result);
      }
      res.json({ success: true, suppliers: insertedSuppliers });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Transactions
  app.get("/api/debug-counts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.uid, req.user!.id)
      });
      if (!user) return res.status(404).json({ error: "User not found" });

      const supplierCount = await db.select({ count: count() }).from(suppliers).where(eq(suppliers.userId, user.id));
      const transactionCount = await db.select({ count: count() }).from(transactions);
      
      res.json({ supplierCount: supplierCount[0].count, transactionCount: transactionCount[0].count });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/total-amount", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.uid, req.user!.id)
      });
      if (!user) return res.status(404).json({ error: "User not found" });

      const allSuppliers = await db.query.suppliers.findMany({
        where: eq(suppliers.userId, user.id)
      });
      
      let totalAmount = 0;
      for (const supplier of allSuppliers) {
        const txs = await db.query.transactions.findMany({
          where: eq(transactions.supplierId, supplier.id)
        });
        for (const tx of txs) {
          if (tx.type === 'delivery') {
            totalAmount += parseFloat(tx.totalBill || '0');
          } else {
            totalAmount -= parseFloat(tx.amount || '0');
          }
        }
      }
      res.json({ totalAmount });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/transactions/:supplierExternalId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const supplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.externalId, req.params.supplierExternalId as string)
      });
      if (!supplier) return res.status(404).json({ error: "Supplier not found" });

      const result = await db.query.transactions.findMany({
        where: eq(transactions.supplierId, supplier.id),
        with: { items: true }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/transactions/:supplierExternalId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const supplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.externalId, req.params.supplierExternalId as string)
      });
      if (!supplier) return res.status(404).json({ error: "Supplier not found" });

      const { transactions: txsData } = req.body;
      for (const t of txsData) {
        const [tx] = await db.insert(transactions)
          .values({
            externalId: t.id,
            supplierId: supplier.id,
            type: t.type,
            date: t.date,
            amount: t.amount?.toString(),
            totalBill: t.totalBill?.toString(),
            note: t.note,
          })
          .onConflictDoUpdate({
            target: transactions.externalId,
            set: {
              date: t.date,
              amount: t.amount?.toString(),
              totalBill: t.totalBill?.toString(),
              note: t.note,
            }
          })
          .returning();

        if (t.type === 'delivery' && t.items) {
          // Re-sync items: delete and re-insert for simplicity
          await db.delete(deliveryItems).where(eq(deliveryItems.transactionId, tx.id));
          for (const item of t.items) {
            await db.insert(deliveryItems).values({
              transactionId: tx.id,
              category: item.category,
              weight: item.weight.toString(),
              rate: item.rate.toString(),
              total: item.total.toString(),
            });
          }
        }
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Formulas
  app.get("/api/formulas", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.uid, req.user!.id)
      });
      if (!user) return res.status(404).json({ error: "User not found" });

      const result = await db.query.formulas.findMany({
        where: eq(formulas.userId, user.id)
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/formulas", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.uid, req.user!.id)
      });
      if (!user) return res.status(404).json({ error: "User not found" });

      const { formulas: formulasData } = req.body;
      for (const f of formulasData) {
        await db.insert(formulas)
          .values({
            externalId: f.id,
            userId: user.id,
            name: f.name,
            category: f.category,
            expression: f.expression,
            variables: f.variables,
          })
          .onConflictDoUpdate({
            target: formulas.externalId,
            set: {
              name: f.name,
              category: f.category,
              expression: f.expression,
              variables: f.variables,
            }
          });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
