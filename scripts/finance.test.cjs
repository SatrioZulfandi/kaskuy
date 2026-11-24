// Run with Node 22.13+: node --test scripts/finance.test.cjs
// Production TypeScript runs unchanged; only Expo's native SQLite boundary is
// replaced with real SQLite connections to an isolated temporary database.
// No app data is opened; temporary files are removed after each test.
/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');

function createHarness() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kaskuy-finance-test-'));
  const databasePath = path.join(directory, 'finance.db');
  const connections = [];
  const cache = new Map();
  const bindings = (args) => args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  let byteFile = 0;
  function createConnection(filename = databasePath) {
    const nativeDb = new DatabaseSync(filename);
    let closed = false;
    const db = {
      async execAsync(sql) {
        nativeDb.exec(sql);
      },
      async runAsync(sql, ...args) {
        const result = nativeDb.prepare(sql).run(...bindings(args));
        return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
      },
      async getFirstAsync(sql, ...args) {
        const result = nativeDb.prepare(sql).get(...bindings(args));
        return result ? { ...result } : null;
      },
      async getAllAsync(sql, ...args) {
        return nativeDb.prepare(sql).all(...bindings(args)).map((row) => ({ ...row }));
      },
      async serializeAsync(schema) {
        const serializedPath = path.join(directory, `serialized-${++byteFile}.sqlite`);
        nativeDb.prepare(`VACUUM ${schema} INTO ?`).run(serializedPath);
        return fs.readFileSync(serializedPath);
      },
      async withTransactionAsync(task) {
        nativeDb.exec('BEGIN');
        try {
          await task();
          nativeDb.exec('COMMIT');
        } catch (error) {
          nativeDb.exec('ROLLBACK');
          throw error;
        }
      },
      async closeAsync() {
        if (!closed) nativeDb.close();
        closed = true;
      },
    };
    const connection = { nativeDb, db };
    connections.push(connection);
    return connection;
  }
  const reader = createConnection();

  function load(file) {
    const resolved = path.resolve(projectRoot, file);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const source = fs.readFileSync(resolved, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: resolved,
    }).outputText;
    const module = { exports: {} };
    cache.set(resolved, module);
    function localRequire(specifier) {
      if (specifier === 'expo-sqlite') {
        return {
          openDatabaseAsync: async (name, options, targetDirectory) => targetDirectory
            ? createConnection(path.join(targetDirectory, name)).db
            : options?.useNewConnection ? createConnection().db : reader.db,
          deserializeDatabaseAsync: async (bytes) => {
            const filename = path.join(directory, `deserialized-${++byteFile}.sqlite`);
            fs.writeFileSync(filename, bytes);
            return createConnection(filename).db;
          },
        };
      }
      if (specifier.startsWith('.')) {
        const target = path.resolve(path.dirname(resolved), specifier);
        const targetFile = [target, `${target}.ts`, path.join(target, 'index.ts')]
          .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (!targetFile) throw new Error(`Cannot resolve ${specifier} from ${resolved}`);
        return load(targetFile);
      }
      return require(specifier);
    }
    const execute = vm.compileFunction(compiled, ['require', 'module', 'exports'], { filename: resolved });
    execute(localRequire, module, module.exports);
    return module.exports;
  }

  async function close() {
    for (const connection of connections) await connection.db.closeAsync();
    // Delete only the known files in this test's freshly-created directory.
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  }
  return { db: reader.db, nativeDb: reader.nativeDb, directory, load, close };
}

async function fixture(t) {
  const harness = createHarness();
  t.after(() => harness.close());
  const database = harness.load('src/db/database.ts');
  await database.getDatabase();
  const transactions = harness.load('src/db/repositories/transactionRepo.ts');
  const wallets = harness.load('src/db/repositories/walletRepo.ts');
  const budgets = harness.load('src/db/repositories/budgetRepo.ts');
  const books = harness.load('src/db/repositories/bookRepo.ts');
  const categories = harness.load('src/db/repositories/categoryRepo.ts');
  const settings = harness.load('src/db/repositories/settingsRepo.ts');
  const book = await harness.db.getFirstAsync('SELECT * FROM books WHERE is_default = 1');
  const walletList = await wallets.getWallets(book.id);
  const expense = await harness.db.getFirstAsync("SELECT * FROM categories WHERE type = 'expense' ORDER BY id LIMIT 1");
  const otherExpense = await harness.db.getFirstAsync("SELECT * FROM categories WHERE type = 'expense' AND id <> ? LIMIT 1", [expense.id]);
  const income = await harness.db.getFirstAsync("SELECT * FROM categories WHERE type = 'income' ORDER BY id LIMIT 1");
  const wallet = walletList[0];
  const secondWallet = walletList[1];
  await harness.db.runAsync('UPDATE wallets SET balance = ? WHERE id = ?', [100000, wallet.id]);
  const entry = (overrides = {}) => ({
    book_id: book.id,
    wallet_id: wallet.id,
    category_id: expense.id,
    type: 'expense',
    amount: 10000,
    date: '2026-11-17',
    ...overrides,
  });
  const balance = async (id = wallet.id) => (await wallets.getWalletById(id)).balance;
  const count = async () => (await harness.db.getFirstAsync('SELECT COUNT(*) AS n FROM transactions')).n;
  return { ...harness, transactions, wallets, budgets, books, categories, settings, book, wallet, secondWallet, expense, otherExpense, income, entry, balance, count };
}

test('ledger: create, change amount/type, move wallet, and delete preserve balances', async (t) => {
  const f = await fixture(t);
  const expense = await f.transactions.createTransaction(f.entry());
  assert.equal(await f.balance(), 90000);
  assert.equal(await f.count(), 1);
  await f.transactions.updateTransaction(expense.id, { amount: 25000 });
  assert.equal(await f.balance(), 75000);
  await f.transactions.updateTransaction(expense.id, { type: 'income', category_id: f.income.id, amount: 15000 });
  assert.equal(await f.balance(), 115000);
  await f.transactions.updateTransaction(expense.id, { wallet_id: f.secondWallet.id });
  assert.equal(await f.balance(), 100000);
  assert.equal(await f.balance(f.secondWallet.id), 15000);
  await f.transactions.deleteTransaction(expense.id);
  assert.equal(await f.balance(f.secondWallet.id), 0);
  assert.equal(await f.count(), 0);
});

test('ledger: failed wallet write rolls back newly inserted transaction', async (t) => {
  const f = await fixture(t);
  f.nativeDb.exec(`CREATE TRIGGER fail_wallet_write BEFORE UPDATE OF balance ON wallets
    BEGIN SELECT RAISE(ABORT, 'simulated wallet write failure'); END;`);
  await assert.rejects(f.transactions.createTransaction(f.entry()), /simulated wallet write failure/);
  assert.equal(await f.count(), 0);
  assert.equal(await f.balance(), 100000);
});

test('ledger: failed transaction update restores the original transaction and balance', async (t) => {
  const f = await fixture(t);
  const transaction = await f.transactions.createTransaction(f.entry());
  f.nativeDb.exec(`CREATE TRIGGER fail_transaction_update BEFORE UPDATE ON transactions
    BEGIN SELECT RAISE(ABORT, 'simulated transaction update failure'); END;`);
  await assert.rejects(f.transactions.updateTransaction(transaction.id, { amount: 25000 }), /simulated transaction update failure/);
  assert.equal(await f.balance(), 90000);
  assert.equal((await f.transactions.getTransactionById(transaction.id)).amount, 10000);
});

test('ledger: failed final balance adjustment rolls back transaction edits and both wallets', async (t) => {
  const f = await fixture(t);
  const transaction = await f.transactions.createTransaction(f.entry());
  f.nativeDb.exec(`CREATE TRIGGER fail_destination_write BEFORE UPDATE OF balance ON wallets
    WHEN NEW.id = ${f.secondWallet.id}
    BEGIN SELECT RAISE(ABORT, 'simulated destination write failure'); END;`);
  await assert.rejects(f.transactions.updateTransaction(transaction.id, { wallet_id: f.secondWallet.id, amount: 25000 }), /simulated destination write failure/);
  assert.equal(await f.balance(), 90000);
  assert.equal(await f.balance(f.secondWallet.id), 0);
  const unchanged = await f.transactions.getTransactionById(transaction.id);
  assert.equal(unchanged.amount, 10000);
  assert.equal(unchanged.wallet_id, f.wallet.id);
});

test('ledger: failed delete preserves the original transaction and balance', async (t) => {
  const f = await fixture(t);
  const transaction = await f.transactions.createTransaction(f.entry());
  f.nativeDb.exec(`CREATE TRIGGER fail_transaction_delete BEFORE DELETE ON transactions
    BEGIN SELECT RAISE(ABORT, 'simulated transaction delete failure'); END;`);
  await assert.rejects(f.transactions.deleteTransaction(transaction.id), /simulated transaction delete failure/);
  assert.equal(await f.balance(), 90000);
  assert.equal(await f.count(), 1);
});

test('ledger: duplicate concurrent deletes revert balance exactly once', async (t) => {
  const f = await fixture(t);
  const transaction = await f.transactions.createTransaction(f.entry());
  await Promise.all([
    f.transactions.deleteTransaction(transaction.id),
    f.transactions.deleteTransaction(transaction.id),
  ]);
  assert.equal(await f.balance(), 100000);
  assert.equal(await f.count(), 0);
});

test('ledger: concurrent edits use the latest committed transaction balance', async (t) => {
  const f = await fixture(t);
  const transaction = await f.transactions.createTransaction(f.entry());
  await Promise.all([
    f.transactions.updateTransaction(transaction.id, { amount: 20000 }),
    f.transactions.updateTransaction(transaction.id, { amount: 30000 }),
  ]);
  const current = await f.transactions.getTransactionById(transaction.id);
  assert.equal(await f.balance(), 100000 - current.amount);
});

test('ledger: one failed operation does not poison subsequent queued writes', async (t) => {
  const f = await fixture(t);
  f.nativeDb.exec(`CREATE TRIGGER fail_one_amount BEFORE UPDATE OF balance ON wallets
    WHEN NEW.balance = 80000
    BEGIN SELECT RAISE(ABORT, 'simulated single failure'); END;`);
  const results = await Promise.allSettled([
    f.transactions.createTransaction(f.entry({ amount: 20000 })),
    f.transactions.createTransaction(f.entry({ amount: 5000 })),
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(await f.balance(), 95000);
  assert.equal(await f.count(), 1);
});

test('ledger: the dedicated writer enforces foreign keys before touching balances', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.transactions.createTransaction(f.entry({ scan_result_id: 999999 })), /FOREIGN KEY/);
  assert.equal(await f.count(), 0);
  assert.equal(await f.balance(), 100000);
});

test('ledger: readers cannot see financial writes until the writer commits', async (t) => {
  const f = await fixture(t);
  const { withDatabaseTransaction } = f.load('src/db/database.ts');
  await assert.rejects(withDatabaseTransaction(async (writer) => {
    await writer.runAsync("INSERT INTO books (name) VALUES ('Uncommitted book')");
    assert.equal(await f.db.getFirstAsync("SELECT id FROM books WHERE name = 'Uncommitted book'"), null);
    throw new Error('simulated rollback');
  }), /simulated rollback/);
  assert.equal(await f.db.getFirstAsync("SELECT id FROM books WHERE name = 'Uncommitted book'"), null);
});

test('validation: invalid transaction amounts/dates/category cannot change balances', async (t) => {
  const f = await fixture(t);
  const invalidInputs = [
    { amount: -1 }, { amount: 0 }, { amount: NaN }, { amount: Infinity },
    { amount: 1.5 }, { amount: Number.MAX_SAFE_INTEGER + 1 },
    { date: '' }, { date: '2026-2-01' }, { date: '2026-02-31' }, { date: '2025-02-29' },
    { date: '2026-13-01' }, { category_id: f.income.id }, { wallet_id: 999999 },
  ];
  for (const invalid of invalidInputs) {
    await assert.rejects(f.transactions.createTransaction(f.entry(invalid)), `Accepted ${JSON.stringify(invalid)}`);
    assert.equal(await f.count(), 0);
    assert.equal(await f.balance(), 100000);
  }
  await f.transactions.createTransaction(f.entry({ date: '2024-02-29' }));
  assert.equal(await f.count(), 1);
});

test('validation: wallet from another book cannot be used for a transaction', async (t) => {
  const f = await fixture(t);
  const secondBook = await f.db.runAsync("INSERT INTO books (name) VALUES ('Separate book')");
  const foreignWallet = await f.wallets.createWallet(secondBook.lastInsertRowId, 'Other wallet', 'cash', 50000, 'cash', '#000000');
  await assert.rejects(f.transactions.createTransaction(f.entry({ wallet_id: foreignWallet.id })));
  assert.equal(await f.balance(foreignWallet.id), 50000);
  assert.equal(await f.count(), 0);
});

test('validation: failed FK or invalid edit leaves an existing ledger unchanged', async (t) => {
  const f = await fixture(t);
  const transaction = await f.transactions.createTransaction(f.entry());
  for (const change of [{ category_id: 999999 }, { category_id: f.income.id }, { amount: -5000 }, { date: '' }]) {
    await assert.rejects(f.transactions.updateTransaction(transaction.id, change));
    assert.equal(await f.balance(), 90000);
    assert.equal((await f.transactions.getTransactionById(transaction.id)).amount, 10000);
  }
});

test('validation: budgets require a real month, positive amount, and expense category', async (t) => {
  const f = await fixture(t);
  for (const month of ['', '2026-2', '2026-00', '2026-13', '2026-11-01']) {
    await assert.rejects(f.budgets.setBudget(f.book.id, f.expense.id, month, 50000));
  }
  for (const amount of [0, -1, Infinity, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', amount));
  }
  await assert.rejects(f.budgets.setBudget(f.book.id, f.income.id, '2026-11', 50000));
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 50000);
  const budgets = await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11');
  assert.equal(budgets.length, 1);
  assert.equal(budgets[0].amount, 50000);
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 75000);
  const updatedBudgets = await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11');
  assert.equal(updatedBudgets.length, 1);
  assert.equal(updatedBudgets[0].amount, 75000);
});

test('wallets: opening balances preserve parsed Rupiah, zero, and debt while rejecting invalid numbers', async (t) => {
  const f = await fixture(t);
  const { parseRupiahInput } = f.load('src/lib/currency.ts');
  for (const [input, expected] of [['Rp 1.500.000,00', 1500000], ['0', 0], ['-Rp 25.000', -25000]]) {
    const wallet = await f.wallets.createWallet(f.book.id, '  New wallet  ', 'cash', parseRupiahInput(input), 'cash', '#000000');
    assert.equal(wallet.balance, expected);
    assert.equal(wallet.name, 'New wallet');
  }
  const before = (await f.wallets.getWallets(f.book.id)).length;
  for (const invalid of [NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(f.wallets.createWallet(f.book.id, 'Invalid balance', 'cash', invalid, 'cash', '#000000'));
  }
  assert.equal((await f.wallets.getWallets(f.book.id)).length, before);
});

test('wallets: balance overflow rejects direct adjustments and atomically rolls back creates and transfers', async (t) => {
  const f = await fixture(t);
  await f.db.runAsync('UPDATE wallets SET balance = ? WHERE id = ?', [Number.MAX_SAFE_INTEGER, f.wallet.id]);
  await assert.rejects(f.wallets.updateWalletBalance(f.wallet.id, 1));
  await assert.rejects(f.transactions.createTransaction(f.entry({ type: 'income', category_id: f.income.id, amount: 1 })));
  assert.equal(await f.balance(), Number.MAX_SAFE_INTEGER);
  assert.equal(await f.count(), 0);

  await f.db.runAsync('UPDATE wallets SET balance = ? WHERE id = ?', [-Number.MAX_SAFE_INTEGER, f.wallet.id]);
  await assert.rejects(f.transactions.createTransaction(f.entry({ amount: 1 })));
  assert.equal(await f.balance(), -Number.MAX_SAFE_INTEGER);
  assert.equal(await f.count(), 0);

  await f.db.runAsync('UPDATE wallets SET balance = ? WHERE id = ?', [100000, f.wallet.id]);
  const transaction = await f.transactions.createTransaction(f.entry());
  await f.db.runAsync('UPDATE wallets SET balance = ? WHERE id = ?', [Number.MAX_SAFE_INTEGER, f.secondWallet.id]);
  await assert.rejects(f.transactions.updateTransaction(transaction.id, {
    wallet_id: f.secondWallet.id, type: 'income', category_id: f.income.id, amount: 1,
  }));
  const unchanged = await f.transactions.getTransactionById(transaction.id);
  assert.equal(unchanged.wallet_id, f.wallet.id);
  assert.equal(unchanged.type, 'expense');
  assert.equal(unchanged.amount, 10000);
  assert.equal(await f.balance(), 90000);
  assert.equal(await f.balance(f.secondWallet.id), Number.MAX_SAFE_INTEGER);
});

test('wallets: archived wallets disappear from selection and cannot receive new transactions', async (t) => {
  const f = await fixture(t);
  await f.wallets.updateWallet(f.wallet.id, { name: 'Archived wallet', is_archived: 1 });
  const archived = await f.wallets.getWalletById(f.wallet.id);
  assert.equal(archived.name, 'Archived wallet');
  assert.equal(archived.is_archived, 1);
  assert.ok((await f.wallets.getWallets(f.book.id)).every((wallet) => wallet.id !== f.wallet.id));
  await assert.rejects(f.transactions.createTransaction(f.entry()));
  assert.equal(await f.balance(), 100000);
  assert.equal(await f.count(), 0);
});

test('wallets: used wallets report a friendly delete error while unused wallets can be deleted', async (t) => {
  const f = await fixture(t);
  const transaction = await f.transactions.createTransaction(f.entry());
  await assert.rejects(f.wallets.deleteWallet(f.wallet.id), /masih memiliki transaksi/i);
  assert.equal(await f.balance(), 90000);
  assert.equal(await f.count(), 1);
  await f.wallets.deleteWallet(f.secondWallet.id);
  assert.equal(await f.wallets.getWalletById(f.secondWallet.id), null);
  await f.transactions.deleteTransaction(transaction.id);
  await f.wallets.deleteWallet(f.wallet.id);
  assert.equal(await f.wallets.getWalletById(f.wallet.id), null);
});

test('budgets: deleting one budget leaves other budgets and the financial ledger intact', async (t) => {
  const f = await fixture(t);
  await f.transactions.createTransaction(f.entry());
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 50000);
  await f.budgets.setBudget(f.book.id, f.otherExpense.id, '2026-11', 75000);
  const original = await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11');
  const removed = original.find((budget) => budget.category_id === f.expense.id);
  await f.budgets.deleteBudget(removed.id);
  await f.budgets.deleteBudget(removed.id);
  const remaining = await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].category_id, f.otherExpense.id);
  assert.equal(remaining[0].amount, 75000);
  assert.equal(await f.balance(), 90000);
  assert.equal(await f.count(), 1);
});

test('startup: concurrent database requests initialize and seed the database only once', async (t) => {
  const f = createHarness();
  t.after(() => f.close());
  const { getDatabase } = f.load('src/db/database.ts');
  const databases = await Promise.all(Array.from({ length: 8 }, () => getDatabase()));
  assert.ok(databases.every((database) => database === databases[0]));
  const books = await f.db.getFirstAsync('SELECT COUNT(*) AS n FROM books');
  assert.equal(books.n, 1);
  const walletNames = await f.db.getAllAsync('SELECT name, COUNT(*) AS n FROM wallets GROUP BY name');
  assert.equal(walletNames.length, 3);
  assert.ok(walletNames.every((wallet) => wallet.n === 1));
  const categories = await f.db.getFirstAsync('SELECT COUNT(*) AS n FROM categories');
  assert.equal(categories.n, 14);
});

test('budgets: near-limit spending retains the actual remaining amount and fractional progress', async (t) => {
  const f = await fixture(t);
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 1000000);
  const transaction = await f.transactions.createTransaction(f.entry({ amount: 996000 }));
  let [budget] = await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11');
  assert.equal(budget.percentage, 99.6);
  assert.equal(budget.remaining, 4000);
  await f.transactions.updateTransaction(transaction.id, { amount: 1000000 });
  [budget] = await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11');
  assert.equal(budget.remaining, 0);
  assert.equal(budget.percentage, 100);
  await f.transactions.updateTransaction(transaction.id, { amount: 1004000 });
  [budget] = await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11');
  assert.equal(budget.remaining, -4000);
  assert.equal(budget.percentage, 100.4);
});

test('reports: spending summary includes categories with no budget and respects book/date/type', async (t) => {
  const f = await fixture(t);
  await f.transactions.createTransaction(f.entry({ amount: 10000 }));
  await f.transactions.createTransaction(f.entry({ category_id: f.otherExpense.id, amount: 25000 }));
  await f.transactions.createTransaction(f.entry({ type: 'income', category_id: f.income.id, amount: 80000 }));
  await f.transactions.createTransaction(f.entry({ date: '2026-10-31', amount: 5000 }));
  const otherBook = await f.db.runAsync("INSERT INTO books (name) VALUES ('Excluded book')");
  const otherWallet = await f.wallets.createWallet(otherBook.lastInsertRowId, 'Excluded wallet', 'cash', 100000, 'cash', '#000000');
  await f.transactions.createTransaction(f.entry({ book_id: otherBook.lastInsertRowId, wallet_id: otherWallet.id, amount: 60000 }));
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 50000);
  assert.deepEqual(await f.transactions.getSummary(f.book.id, '2026-11-01', '2026-11-30'), {
    income: 80000, expense: 35000, total: 45000,
  });
  const breakdown = await f.transactions.getCategoryBreakdown(f.book.id, 'expense', '2026-11-01', '2026-11-30');
  assert.equal(breakdown.reduce((sum, category) => sum + category.total, 0), 35000);
  // The budget summary intentionally tracks only budgeted categories.
  assert.equal((await f.budgets.getBudgetSummary(f.book.id, '2026-11')).totalSpent, 10000);
});

test('reports: daily trends include seven ordered calendar days including zeros', async (t) => {
  const f = await fixture(t);
  await f.transactions.createTransaction(f.entry({ date: '2026-10-31', amount: 10000 }));
  await f.transactions.createTransaction(f.entry({ date: '2026-11-02', amount: 5000 }));
  await f.transactions.createTransaction(f.entry({ date: '2026-11-02', type: 'income', category_id: f.income.id, amount: 20000 }));
  await f.transactions.createTransaction(f.entry({ date: '2026-11-06', amount: 9000 }));
  assert.deepEqual(await f.transactions.getDailyTrends(f.book.id, '2026-10-30', '2026-11-05'), [
    { date: '2026-10-30', income: 0, expense: 0 },
    { date: '2026-10-31', income: 0, expense: 10000 },
    { date: '2026-11-01', income: 0, expense: 0 },
    { date: '2026-11-02', income: 20000, expense: 5000 },
    { date: '2026-11-03', income: 0, expense: 0 },
    { date: '2026-11-04', income: 0, expense: 0 },
    { date: '2026-11-05', income: 0, expense: 0 },
  ]);
});

test('reports: monthly trends return six calendar months with zeros across a year boundary', async (t) => {
  const f = await fixture(t);
  for (let month = 1; month <= 12; month++) {
    await f.transactions.createTransaction(f.entry({ date: `2025-${String(month).padStart(2, '0')}-15`, amount: month * 1000 }));
  }
  await f.transactions.createTransaction(f.entry({ date: '2026-01-31', type: 'income', category_id: f.income.id, amount: 50000 }));
  await f.transactions.createTransaction(f.entry({ date: '2026-02-01', amount: 9000 }));
  const months = await f.transactions.getMonthlyTrends(f.book.id, 6, '2026-01');
  assert.deepEqual(months, [
    { month: '2025-08', income: 0, expense: 8000 },
    { month: '2025-09', income: 0, expense: 9000 },
    { month: '2025-10', income: 0, expense: 10000 },
    { month: '2025-11', income: 0, expense: 11000 },
    { month: '2025-12', income: 0, expense: 12000 },
    { month: '2026-01', income: 50000, expense: 0 },
  ]);
  const emptyMonths = await f.transactions.getMonthlyTrends(f.book.id, 3, '2024-02');
  assert.deepEqual(emptyMonths, [
    { month: '2023-12', income: 0, expense: 0 },
    { month: '2024-01', income: 0, expense: 0 },
    { month: '2024-02', income: 0, expense: 0 },
  ]);
});

test('reports: a single transaction type across twelve months still returns exactly six months', async (t) => {
  const f = await fixture(t);
  for (let month = 1; month <= 12; month++) {
    await f.transactions.createTransaction(f.entry({ date: `2026-${String(month).padStart(2, '0')}-01`, amount: 1000 }));
  }
  const months = await f.transactions.getMonthlyTrends(f.book.id, 6, '2026-11');
  assert.equal(months.length, 6);
  assert.deepEqual(months.map((row) => row.month), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.ok(months.every((row) => row.income === 0 && row.expense === 1000));
});

test('dates: validation rejects impossible dates and noncanonical date/month strings', async (t) => {
  const f = createHarness();
  t.after(() => f.close());
  const date = f.load('src/lib/date.ts');
  for (const valid of ['2024-02-29', '2000-02-29', '2026-04-30', '2026-12-31']) {
    assert.equal(date.isValidDateString(valid), true, valid);
  }
  for (const invalid of ['', '2026-2-01', '2026-02-31', '2025-02-29', '1900-02-29', '2100-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '0000-01-01', '2026-11-17T00:00:00', ' 2026-11-17']) {
    assert.equal(date.isValidDateString(invalid), false, invalid);
  }
  assert.equal(date.isValidMonthString('2026-02'), true);
  for (const invalid of ['', '2026-2', '2026-00', '2026-13', '2026-02-01', '0000-01']) {
    assert.equal(date.isValidMonthString(invalid), false, invalid);
  }
});

test('dates: period navigation cannot skip February at the end of January', async (t) => {
  const f = createHarness();
  t.after(() => f.close());
  const date = f.load('src/lib/date.ts');
  const january = new Date(2026, 0, 31, 12);
  assert.equal(date.formatDateString(date.shiftPeriodDate('Bulanan', january, 1)), '2026-02-01');
  assert.equal(date.formatDateString(january), '2026-01-31');
  assert.equal(date.formatDateString(date.shiftPeriodDate('Bulanan', new Date(2026, 0, 31), -1)), '2025-12-01');
  assert.equal(date.formatDateString(date.shiftPeriodDate('Tahunan', new Date(2024, 1, 29), 1)), '2025-01-01');
  assert.equal(date.formatDateString(date.shiftPeriodDate('Harian', new Date(2026, 11, 31), 1)), '2027-01-01');
  assert.equal(date.formatDateString(date.shiftPeriodDate('Mingguan', new Date(2026, 0, 3), -1)), '2025-12-27');
});

test('dates: month/day ranges include leap days and both endpoints across a year boundary', async (t) => {
  const f = createHarness();
  t.after(() => f.close());
  const date = f.load('src/lib/date.ts');
  assert.deepEqual(date.getMonthRange('2024-02'), { startDate: '2024-02-01', endDate: '2024-02-29' });
  assert.deepEqual(date.getMonthRange('2026-02'), { startDate: '2026-02-01', endDate: '2026-02-28' });
  assert.deepEqual(date.getDateStringsInRange('2025-12-30', '2026-01-02'), ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  assert.deepEqual(date.getDateStringsInRange('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.deepEqual(date.getPeriodRange('Mingguan', new Date(2026, 0, 3)), { startDate: '2025-12-28', endDate: '2026-01-03' });
  assert.throws(() => date.getMonthRange('2026-13'));
  assert.throws(() => date.getDateStringsInRange('2026-02-31', '2026-03-01'));
  assert.throws(() => date.getDateStringsInRange('2026-11-18', '2026-11-17'));
});

test('currency: Indonesian formatted amounts preserve value and malformed input is rejected', async (t) => {
  const f = createHarness();
  t.after(() => f.close());
  const currency = f.load('src/lib/currency.ts');
  for (const [input, expected] of [
    ['1500000', 1500000], ['1.500.000', 1500000], ['Rp 1.500.000', 1500000],
    ['Rp 1.500.000,00', 1500000], ['0', 0], ['-1.500', -1500], ['-Rp 1.500', -1500],
  ]) {
    assert.equal(currency.parseRupiahInput(input), expected, input);
  }
  for (const invalid of ['', 'Rp', 'abc', '1.50.000', '1,5', '1.500,50', '1e6', '12foo', '--100', '1,500', '9007199254740992']) {
    assert.equal(currency.parseRupiahInput(invalid), null, invalid);
  }
  for (const amount of [0, 1, 1500, 1500000, -1500000]) {
    assert.equal(currency.parseRupiahInput(currency.formatRupiah(amount)), amount);
  }
});

test('charts: daily bars remain proportional for amounts above Rp500.000', async (t) => {
  const f = createHarness();
  t.after(() => f.close());
  const { getTrendBarHeight } = f.load('src/lib/trends.ts');
  assert.equal(getTrendBarHeight(600000, 6000000), 7);
  assert.equal(getTrendBarHeight(6000000, 6000000), 70);
  assert.equal(getTrendBarHeight(3000000, 6000000, 100), 50);
  assert.equal(getTrendBarHeight(0, 0), 0);
  assert.equal(getTrendBarHeight(-100, 1000), 0);
  assert.equal(getTrendBarHeight(Infinity, 1000), 0);
  assert.equal(getTrendBarHeight(1000, 0), 0);
});

test('books: create gives a usable cash wallet and switching maintains exactly one active book', async (t) => {
  const f = await fixture(t);
  const created = await f.books.createBook('  Keuangan Keluarga  ');
  assert.equal(created.name, 'Keuangan Keluarga');
  assert.equal(created.is_default, 0);
  const wallets = await f.wallets.getWallets(created.id);
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0].type, 'cash');
  assert.equal(wallets[0].balance, 0);
  await f.transactions.createTransaction(f.entry({ book_id: created.id, wallet_id: wallets[0].id, amount: 1000 }));
  assert.equal((await f.wallets.getWalletById(wallets[0].id)).balance, -1000);
  await f.books.updateBook(created.id, 'Keluarga');
  await f.books.setDefaultBook(created.id);
  assert.equal((await f.books.getDefaultBook()).name, 'Keluarga');
  assert.equal((await f.books.getAllBooks()).filter((book) => book.is_default === 1).length, 1);
  await assert.rejects(f.books.setDefaultBook(999999));
  assert.equal((await f.books.getDefaultBook()).id, created.id);
  await Promise.all([f.books.setDefaultBook(f.book.id), f.books.setDefaultBook(created.id)]);
  assert.equal((await f.books.getDefaultBook()).id, created.id);
  assert.equal((await f.books.getAllBooks()).filter((book) => book.is_default === 1).length, 1);
});

test('books: blank, oversized, and duplicate names cannot create or overwrite books', async (t) => {
  const f = await fixture(t);
  const created = await f.books.createBook('Usaha');
  for (const invalid of ['', '  ', 'x'.repeat(61), 'usaha', '  Buku Utama  ']) {
    await assert.rejects(f.books.createBook(invalid), invalid);
  }
  await assert.rejects(f.books.updateBook(created.id, 'buku utama'));
  await assert.rejects(f.books.updateBook(created.id, ' '));
  await assert.rejects(f.books.updateBook(999999, 'Tidak Ada'));
  assert.equal((await f.books.getAllBooks()).find((book) => book.id === created.id).name, 'Usaha');
  assert.equal((await f.books.getAllBooks()).length, 2);
});

test('books: failure inserting the default wallet rolls back book creation', async (t) => {
  const f = await fixture(t);
  await f.db.execAsync(`CREATE TRIGGER fail_new_book_wallet BEFORE INSERT ON wallets
    BEGIN SELECT RAISE(ABORT, 'default wallet failed'); END;`);
  await assert.rejects(f.books.createBook('Rollback'), /default wallet failed/);
  assert.equal((await f.books.getAllBooks()).length, 1);
  assert.equal((await f.wallets.getWallets(f.book.id)).length, 3);
  await f.db.execAsync('DROP TRIGGER fail_new_book_wallet');
  assert.equal((await f.books.createBook('Retry')).name, 'Retry');
});

test('books: deletion protects active books, transactions, budgets, and nonzero balances', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.books.deleteBook(f.book.id), /aktif/i);
  const used = await f.books.createBook('Riwayat');
  const [usedWallet] = await f.wallets.getWallets(used.id);
  const transaction = await f.transactions.createTransaction(f.entry({ book_id: used.id, wallet_id: usedWallet.id }));
  await assert.rejects(f.books.deleteBook(used.id));
  await f.transactions.deleteTransaction(transaction.id);
  await f.budgets.setBudget(used.id, f.expense.id, '2026-11', 10000);
  await assert.rejects(f.books.deleteBook(used.id));
  const [budget] = await f.budgets.getBudgetsWithProgress(used.id, '2026-11');
  await f.budgets.deleteBudget(budget.id);
  await f.wallets.updateWalletBalance(usedWallet.id, 1);
  await assert.rejects(f.books.deleteBook(used.id));
  await f.wallets.updateWalletBalance(usedWallet.id, -1);
  await f.books.deleteBook(used.id);
  assert.equal((await f.books.getAllBooks()).length, 1);
  assert.equal(await f.wallets.getWalletById(usedWallet.id), null);
  assert.equal((await f.books.getDefaultBook()).id, f.book.id);
  assert.equal(await f.balance(), 100000);
});

test('categories: custom CRUD preserves its transaction type and prevents duplicate names within that type', async (t) => {
  const f = await fixture(t);
  const category = await f.categories.createCategory('  Kendaraan  ', 'expense', 'transport', '#0066FF');
  assert.equal(category.name, 'Kendaraan');
  assert.equal(category.is_default, 0);
  await assert.rejects(f.categories.createCategory('kendaraan', 'expense', 'transport', '#0066FF'));
  const income = await f.categories.createCategory('Kendaraan', 'income', 'business', '#0066FF');
  assert.equal(income.type, 'income');
  await f.categories.updateCategory(category.id, { name: 'Perawatan', icon: 'health', color: '#F59E0B', sort_order: 99 });
  const updated = await f.categories.getCategoryById(category.id);
  assert.equal(updated.name, 'Perawatan');
  assert.equal(updated.type, 'expense');
  assert.equal(updated.icon, 'health');
  assert.equal(updated.color, '#F59E0B');
  assert.equal(updated.sort_order, 99);
  await assert.rejects(f.categories.updateCategory(category.id, { name: f.expense.name }));
  assert.equal((await f.categories.getCategoryById(category.id)).name, 'Perawatan');
  await f.categories.deleteCategory(category.id);
  assert.equal(await f.categories.getCategoryById(category.id), null);
  assert.equal((await f.categories.getCategoryById(income.id)).name, 'Kendaraan');
});

test('categories: invalid names, types, icons, colors, and sort orders leave data unchanged', async (t) => {
  const f = await fixture(t);
  const original = await f.categories.getCategories();
  for (const values of [
    ['', 'expense', 'other', '#0066FF'], ['x'.repeat(41), 'expense', 'other', '#0066FF'],
    ['Invalid', 'transfer', 'other', '#0066FF'], ['Invalid', 'expense', 'invalid', '#0066FF'],
    ['Invalid', 'expense', 'other', 'red'], ['Invalid', 'expense', 'other', '#12345'],
  ]) await assert.rejects(f.categories.createCategory(...values));
  for (const change of [{ name: '' }, { icon: 'invalid' }, { color: 'red' }, { sort_order: -1 }, { sort_order: 1.5 }]) {
    await assert.rejects(f.categories.updateCategory(f.expense.id, change));
  }
  assert.deepEqual(await f.categories.getCategories(), original);
});

test('categories: built-in and referenced categories cannot be deleted and no financial data is lost', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.categories.deleteCategory(f.expense.id), /bawaan/i);
  const usedByTransaction = await f.categories.createCategory('Servis', 'expense', 'transport', '#0066FF');
  const transaction = await f.transactions.createTransaction(f.entry({ category_id: usedByTransaction.id }));
  await assert.rejects(f.categories.deleteCategory(usedByTransaction.id), /transaksi|budget/i);
  assert.equal((await f.transactions.getTransactionById(transaction.id)).category_name, 'Servis');
  assert.equal(await f.balance(), 90000);
  await f.transactions.deleteTransaction(transaction.id);
  const usedByBudget = await f.categories.createCategory('Perawatan', 'expense', 'health', '#F59E0B');
  await f.budgets.setBudget(f.book.id, usedByBudget.id, '2026-11', 50000);
  await assert.rejects(f.categories.deleteCategory(usedByBudget.id), /transaksi|budget/i);
  assert.equal((await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11')).length, 1);
  await f.categories.deleteCategory(usedByTransaction.id);
  assert.equal(await f.categories.getCategoryById(usedByTransaction.id), null);
  assert.equal(await f.balance(), 100000);
});

test('preferences: theme and onboarding choices persist while invalid values cannot overwrite them', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.settings.getAppPreferences(), { theme: 'system', onboardingCompleted: false });
  for (const theme of ['dark', 'light', 'system']) {
    await f.settings.setAppPreference('theme', theme);
    assert.equal((await f.settings.getAppPreferences()).theme, theme);
    assert.equal((await f.db.getFirstAsync('SELECT value FROM app_settings WHERE key = ?', ['theme'])).value, theme);
  }
  await f.settings.setAppPreference('theme', 'dark');
  await f.settings.setAppPreference('onboarding_completed', '1');
  for (const invalid of ['', 'night', 'DARK']) await assert.rejects(f.settings.setAppPreference('theme', invalid));
  for (const invalid of ['', 'true', '2']) await assert.rejects(f.settings.setAppPreference('onboarding_completed', invalid));
  assert.deepEqual(await f.settings.getAppPreferences(), { theme: 'dark', onboardingCompleted: true });
  await f.settings.setAppPreference('onboarding_completed', '0');
  assert.equal((await f.settings.getAppPreferences()).onboardingCompleted, false);
});

test('migrations: interrupted legacy seeds recover missing choices without replacing custom balances or categories', async (t) => {
  for (const hasCustomData of [false, true]) {
    const f = createHarness();
    t.after(() => f.close());
    await f.db.execAsync(f.load('src/db/schema.ts').CREATE_TABLES_SQL);
    const book = await f.db.runAsync("INSERT INTO books (name, is_default) VALUES ('Buku Lama', 1)");
    if (hasCustomData) {
      await f.db.runAsync("INSERT INTO wallets (book_id, name, type, balance) VALUES (?, 'Dompet Lama', 'cash', 789000)", [book.lastInsertRowId]);
      await f.db.runAsync("INSERT INTO categories (name, type, icon, color) VALUES ('Kategori Lama', 'expense', 'other', '#123456')");
    }
    await f.load('src/db/database.ts').getDatabase();
    const wallets = await f.db.getAllAsync('SELECT * FROM wallets');
    assert.equal(wallets.length, hasCustomData ? 1 : 3);
    assert.equal(wallets[0].balance, hasCustomData ? 789000 : 0);
    const expenses = await f.db.getAllAsync("SELECT * FROM categories WHERE type = 'expense'");
    assert.equal(expenses.length, hasCustomData ? 1 : 8);
    if (hasCustomData) assert.equal(expenses[0].name, 'Kategori Lama');
    assert.equal((await f.db.getAllAsync("SELECT * FROM categories WHERE type = 'income'")).length, 6);
    await f.load('src/db/seeds.ts').seedInitialData(f.db, true);
    assert.equal((await f.db.getAllAsync('SELECT * FROM wallets')).length, wallets.length);
    assert.equal((await f.db.getAllAsync('SELECT * FROM books')).length, 1);
  }
});

test('migrations: opening legacy v0 data preserves ledger and balances and migration is idempotent', async (t) => {
  const f = createHarness();
  t.after(() => f.close());
  await f.db.execAsync(f.load('src/db/schema.ts').CREATE_TABLES_SQL);
  await f.load('src/db/seeds.ts').seedInitialData(f.db);
  const book = await f.db.getFirstAsync('SELECT * FROM books WHERE is_default = 1');
  const wallet = await f.db.getFirstAsync('SELECT * FROM wallets ORDER BY id LIMIT 1');
  const category = await f.db.getFirstAsync("SELECT * FROM categories WHERE type = 'expense' ORDER BY id LIMIT 1");
  await f.db.runAsync('UPDATE wallets SET balance = ? WHERE id = ?', [123456, wallet.id]);
  await f.db.runAsync('INSERT INTO transactions (book_id, wallet_id, category_id, type, amount, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [book.id, wallet.id, category.id, 'expense', 5000, 'Data lama', '2026-11-17']);
  await f.db.runAsync('INSERT INTO budgets (book_id, category_id, month, amount) VALUES (?, ?, ?, ?)', [book.id, category.id, '2026-11', 50000]);
  const oldTransactions = await f.db.getAllAsync('SELECT * FROM transactions');
  const oldWallets = await f.db.getAllAsync('SELECT * FROM wallets ORDER BY id');
  const oldBudgets = await f.db.getAllAsync('SELECT * FROM budgets');
  assert.equal((await f.db.getFirstAsync('PRAGMA user_version')).user_version, 0);
  await f.load('src/db/database.ts').getDatabase();
  const migrations = f.load('src/db/migrations.ts');
  assert.equal((await f.db.getFirstAsync('PRAGMA user_version')).user_version, migrations.DATABASE_VERSION);
  await f.load('src/db/repositories/settingsRepo.ts').setAppPreference('theme', 'dark');
  await f.db.withTransactionAsync(() => migrations.migrateDatabase(f.db));
  assert.deepEqual(await f.db.getAllAsync('SELECT * FROM transactions'), oldTransactions);
  assert.deepEqual(await f.db.getAllAsync('SELECT * FROM wallets ORDER BY id'), oldWallets);
  assert.deepEqual(await f.db.getAllAsync('SELECT * FROM budgets'), oldBudgets);
  assert.equal((await f.db.getFirstAsync('SELECT value FROM app_settings WHERE key = ?', ['theme'])).value, 'dark');
  assert.equal((await f.db.getFirstAsync('SELECT COUNT(*) AS n FROM books')).n, 1);
  assert.equal((await f.db.getFirstAsync('SELECT COUNT(*) AS n FROM categories')).n, 14);
});

test('migrations: legacy duplicate active books are repaired and future schema versions are refused', async (t) => {
  const f = createHarness();
  t.after(() => f.close());
  await f.db.execAsync(f.load('src/db/schema.ts').CREATE_TABLES_SQL);
  await f.db.runAsync('INSERT INTO books (name, is_default) VALUES (?, 1)', ['First']);
  await f.db.runAsync('INSERT INTO books (name, is_default) VALUES (?, 1)', ['Second']);
  const migrations = f.load('src/db/migrations.ts');
  await f.db.withTransactionAsync(() => migrations.migrateDatabase(f.db));
  const active = await f.db.getAllAsync('SELECT * FROM books WHERE is_default = 1');
  assert.equal(active.length, 1);
  assert.equal(active[0].name, 'First');
  await assert.rejects(f.db.runAsync('UPDATE books SET is_default = 1 WHERE name = ?', ['Second']));
  await f.db.execAsync(`PRAGMA user_version = ${migrations.DATABASE_VERSION + 1}`);
  await assert.rejects(migrations.migrateDatabase(f.db), /lebih baru/i);
  assert.equal((await f.db.getFirstAsync('PRAGMA user_version')).user_version, migrations.DATABASE_VERSION + 1);
  assert.equal((await f.db.getFirstAsync('SELECT COUNT(*) AS n FROM books')).n, 2);
});

test('budgets: editing month and category updates the same budget with recalculated actual spending', async (t) => {
  const f = await fixture(t);
  await f.transactions.createTransaction(f.entry({ category_id: f.otherExpense.id, date: '2026-12-01', amount: 15000 }));
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 50000);
  const [original] = await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11');
  await f.budgets.updateBudget(original.id, { category_id: f.otherExpense.id, month: '2026-12', amount: 75000 });
  assert.equal((await f.budgets.getBudgetsWithProgress(f.book.id, '2026-11')).length, 0);
  const [updated] = await f.budgets.getBudgetsWithProgress(f.book.id, '2026-12');
  assert.equal(updated.id, original.id);
  assert.equal(updated.category_id, f.otherExpense.id);
  assert.equal(updated.amount, 75000);
  assert.equal(updated.spent, 15000);
  assert.equal(updated.remaining, 60000);
  assert.equal(updated.percentage, 20);
  assert.equal((await f.budgets.getBudgetById(original.id)).month, '2026-12');
  assert.equal(await f.balance(), 85000);
});

test('budgets: conflicting and invalid edits leave both budgets and the ledger unchanged', async (t) => {
  const f = await fixture(t);
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 50000);
  await f.budgets.setBudget(f.book.id, f.otherExpense.id, '2026-12', 75000);
  const original = await f.db.getAllAsync('SELECT * FROM budgets ORDER BY id');
  const target = original[0];
  const data = { category_id: target.category_id, month: target.month, amount: target.amount };
  for (const change of [
    { category_id: f.otherExpense.id, month: '2026-12' }, { category_id: f.income.id },
    { month: '' }, { month: '2026-13' }, { amount: 0 }, { amount: Infinity },
  ]) await assert.rejects(f.budgets.updateBudget(target.id, { ...data, ...change }));
  await assert.rejects(f.budgets.updateBudget(999999, data));
  assert.deepEqual(await f.db.getAllAsync('SELECT * FROM budgets ORDER BY id'), original);
  assert.equal(await f.balance(), 100000);
  assert.equal(await f.count(), 0);
});

test('transactions: archived original wallets can retain edited history but other archived destinations are rejected', async (t) => {
  const f = await fixture(t);
  const transaction = await f.transactions.createTransaction(f.entry());
  await f.wallets.updateWallet(f.wallet.id, { is_archived: 1 });
  await f.wallets.updateWallet(f.secondWallet.id, { is_archived: 1 });
  await f.transactions.updateTransaction(transaction.id, { amount: 15000, note: 'Diperbaiki' });
  assert.equal(await f.balance(), 85000);
  assert.equal((await f.transactions.getTransactionById(transaction.id)).note, 'Diperbaiki');
  await assert.rejects(f.transactions.updateTransaction(transaction.id, { wallet_id: f.secondWallet.id }));
  assert.equal(await f.balance(), 85000);
  assert.equal(await f.balance(f.secondWallet.id), 0);
  await assert.rejects(f.transactions.createTransaction(f.entry()));
  await f.transactions.deleteTransaction(transaction.id);
  assert.equal(await f.balance(), 100000);
  assert.equal((await f.wallets.getWallets(f.book.id, true)).length, 3);
  assert.equal((await f.wallets.getWallets(f.book.id)).length, 1);
});

test('transactions: search, type, category, wallet, date, and pagination filters compose without missing records', async (t) => {
  const f = await fixture(t);
  const ids = [];
  for (let index = 0; index < 7; index++) {
    const created = await f.transactions.createTransaction(f.entry({ note: `Belanja ${index}`, amount: 1000 }));
    ids.push(created.id);
  }
  const income = await f.transactions.createTransaction(f.entry({ type: 'income', category_id: f.income.id, note: 'Bonus', amount: 2000 }));
  const excludedWallet = await f.transactions.createTransaction(f.entry({ wallet_id: f.secondWallet.id, note: 'Belanja lainnya', amount: 1000 }));
  const excludedDate = await f.transactions.createTransaction(f.entry({ date: '2026-10-31', note: 'Belanja lama', amount: 1000 }));
  const otherBook = await f.books.createBook('Other');
  const [otherWallet] = await f.wallets.getWallets(otherBook.id);
  await f.transactions.createTransaction(f.entry({ book_id: otherBook.id, wallet_id: otherWallet.id, note: 'Belanja buku lain', amount: 1000 }));
  const options = { startDate: '2026-11-01', endDate: '2026-11-30', walletId: f.wallet.id, categoryId: f.expense.id, type: 'expense', search: 'BELANJA', limit: 3 };
  const pages = [];
  for (const offset of [0, 3, 6, 9]) pages.push(...await f.transactions.getTransactions(f.book.id, { ...options, offset }));
  assert.deepEqual(pages.map((transaction) => transaction.id), [...ids].reverse());
  assert.equal(new Set(pages.map((transaction) => transaction.id)).size, 7);
  assert.ok(!pages.some((transaction) => [income.id, excludedWallet.id, excludedDate.id].includes(transaction.id)));
  const byCategoryName = await f.transactions.getTransactions(f.book.id, { search: f.income.name, type: 'income' });
  assert.deepEqual(byCategoryName.map((transaction) => transaction.id), [income.id]);
  const byWalletName = await f.transactions.getTransactions(f.book.id, { search: f.secondWallet.name });
  assert.deepEqual(byWalletName.map((transaction) => transaction.id), [excludedWallet.id]);
  assert.equal((await f.transactions.getTransactions(f.book.id, { search: "' OR 1=1 --" })).length, 0);
  assert.equal((await f.transactions.getTransactions(f.book.id, { search: '%' })).length, 0);
});

test('wallets: summary counts all history beyond one page and edits preserve the original balance', async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < 55; index++) await f.transactions.createTransaction(f.entry({ amount: 1000 }));
  await f.transactions.createTransaction(f.entry({ type: 'income', category_id: f.income.id, amount: 2000 }));
  const balance = await f.balance();
  await f.wallets.updateWallet(f.wallet.id, { name: 'Kas Harian', type: 'bank', icon: 'bank', color: '#0066FF' });
  assert.equal(await f.balance(), balance);
  assert.deepEqual(await f.wallets.getWalletSummary(f.wallet.id), { count: 56, income: 2000, expense: 55000 });
  const firstPage = await f.transactions.getTransactions(f.book.id, { walletId: f.wallet.id, limit: 50 });
  const secondPage = await f.transactions.getTransactions(f.book.id, { walletId: f.wallet.id, limit: 50, offset: 50 });
  assert.equal(firstPage.length, 50);
  assert.equal(secondPage.length, 6);
  assert.equal(new Set([...firstPage, ...secondPage].map((transaction) => transaction.id)).size, 56);
});

test('portability: CSV escapes quotes/newlines and neutralizes spreadsheet formulas', (t) => {
  const h = createHarness();
  t.after(() => h.close());
  const { escapeCsvCell, buildTransactionsCsv } = h.load('src/lib/dataPortability.ts');
  assert.equal(escapeCsvCell('say "hello", please'), '"say ""hello"", please"');
  assert.equal(escapeCsvCell('line one\nline two'), '"line one\nline two"');
  assert.equal(escapeCsvCell(null), '""');
  for (const value of ['=SUM(1,2)', '+cmd', '-cmd', '@SUM(1)', '  =1', '\t=1', '\r=1']) {
    assert.ok(escapeCsvCell(value).startsWith('"\''), value);
  }
  const csv = buildTransactionsCsv([{ id: 1, date: '2026-11-18', type: 'expense', wallet_name: 'Kas, Harian', category_name: 'Makanan', amount: 25000, note: '=SUM(1,2)\n"catatan"' }]);
  assert.ok(csv.startsWith('\uFEFF"ID","Tanggal"'));
  assert.ok(csv.includes('"Kas, Harian"'));
  assert.ok(csv.includes('"\'=SUM(1,2)\n""catatan"""'));
  assert.ok(csv.endsWith('\r\n'));
});

test('portability: CSV exports every transaction in the chosen book without page truncation', async (t) => {
  const f = await fixture(t);
  const backup = f.load('src/db/repositories/backupRepo.ts');
  for (let index = 0; index < 105; index++) {
    await f.transactions.createTransaction(f.entry({ amount: 100, note: `Ekspor nomor ${index}` }));
  }
  const other = await f.books.createBook('Buku di luar ekspor');
  const [wallet] = await f.wallets.getWallets(other.id);
  await f.transactions.createTransaction(f.entry({ book_id: other.id, wallet_id: wallet.id, note: 'TRANSAKSI TIDAK TERMASUK', amount: 500 }));
  const csv = await backup.exportTransactionsCsv(f.book.id);
  assert.equal((csv.match(/"Pengeluaran"/g) || []).length, 105);
  assert.ok(csv.includes('Ekspor nomor 0'));
  assert.ok(csv.includes('Ekspor nomor 104'));
  assert.ok(!csv.includes('TRANSAKSI TIDAK TERMASUK'));
  await assert.rejects(backup.exportTransactionsCsv(999999), /tidak ditemukan/i);
});

test('portability: additive restore remaps relations, preserves exact balances and the active book', async (t) => {
  const f = await fixture(t);
  const backup = f.load('src/db/repositories/sqliteBackupRepo.ts');
  await f.transactions.createTransaction(f.entry({ amount: 25000, note: 'Belanja' }));
  await f.transactions.createTransaction(f.entry({ type: 'income', category_id: f.income.id, amount: 50000, note: 'Pendapatan' }));
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 100000);
  await f.wallets.updateWallet(f.secondWallet.id, { is_archived: 1 });
  const originalTransactions = await f.db.getAllAsync('SELECT * FROM transactions ORDER BY id');
  const source = await backup.createSqliteBackup();
  const { restoredBooks: firstRestoredBooks, ...counts } = await backup.restoreSqliteBackup(source);
  assert.deepEqual(counts, { books: 1, wallets: 3, categories: 14, categoriesCreated: 0, transactions: 2, budgets: 1 });
  assert.equal((await f.books.getDefaultBook()).id, f.book.id);
  const importedBook = await f.db.getFirstAsync('SELECT * FROM books WHERE id<>?', [f.book.id]);
  assert.deepEqual(firstRestoredBooks, [{ id: importedBook.id, name: importedBook.name }]);
  assert.match(importedBook.name, /Pemulihan/);
  assert.equal(importedBook.is_default, 0);
  const importedWallets = await f.wallets.getWallets(importedBook.id, true);
  const importedCash = importedWallets.find((wallet) => wallet.name === f.wallet.name);
  assert.equal(importedCash.balance, 125000);
  assert.equal(importedWallets.find((wallet) => wallet.name === f.secondWallet.name).is_archived, 1);
  const importedTransactions = await f.transactions.getTransactions(importedBook.id);
  assert.equal(importedTransactions.length, 2);
  assert.ok(importedTransactions.every((transaction) => transaction.book_id === importedBook.id && transaction.wallet_id === importedCash.id && transaction.scan_result_id === null));
  assert.equal((await f.budgets.getBudgetsWithProgress(importedBook.id, '2026-11'))[0].spent, 25000);
  assert.deepEqual(await f.db.getAllAsync('SELECT * FROM transactions WHERE book_id=? ORDER BY id', [f.book.id]), originalTransactions);
  await backup.restoreSqliteBackup(source);
  const restoredBooks = await f.books.getAllBooks();
  assert.equal(restoredBooks.length, 3);
  assert.equal(new Set(restoredBooks.map((book) => book.name)).size, 3);
  assert.equal(await f.balance(), 125000);
});

test('portability: SQLite backup preserves long existing wallet names and notes', async (t) => {
  const f = await fixture(t);
  const name = 'Nama'.repeat(60);
  const note = 'x'.repeat(100001);
  const wallet = await f.wallets.createWallet(f.book.id, name, 'bank', 123000, 'bank', '#0066FF');
  await f.transactions.createTransaction(f.entry({ wallet_id: wallet.id, note }));
  const repository = f.load('src/db/repositories/sqliteBackupRepo.ts');
  const backup = await repository.createSqliteBackup();
  await repository.restoreSqliteBackup(backup);
  const restoredWallets = await f.db.getAllAsync('SELECT * FROM wallets WHERE name = ?', [name]);
  assert.equal(restoredWallets.length, 2);
  assert.equal(restoredWallets[0].balance, restoredWallets[1].balance);
  assert.equal((await f.db.getAllAsync('SELECT * FROM transactions WHERE note = ?', [note])).length, 2);
});

test('portability: malformed SQLite backup data is rejected before any financial writes', async (t) => {
  const f = await fixture(t);
  const backup = f.load('src/db/repositories/sqliteBackupRepo.ts');
  await f.transactions.createTransaction(f.entry());
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 50000);
  const good = await backup.createSqliteBackup();
  const filename = 'malformed.sqlite';
  const backupPath = path.join(f.directory, filename);
  const malformed = [
    'PRAGMA application_id = 0',
    'UPDATE books SET is_default = 0',
    'UPDATE wallets SET book_id = 999999',
    'UPDATE wallets SET balance = 9007199254740992',
    'UPDATE transactions SET wallet_id = 999999',
    "UPDATE transactions SET date = '2026-02-31'",
    'UPDATE transactions SET amount = -1000',
    "UPDATE budgets SET month = '2026-13'",
    'UPDATE budgets SET category_id = (SELECT min(id) FROM categories WHERE type = \'income\')',
  ];
  for (const sql of malformed) {
    fs.writeFileSync(backupPath, good);
    const broken = new DatabaseSync(backupPath);
    try {
      broken.exec('PRAGMA foreign_keys = OFF; PRAGMA ignore_check_constraints = ON;');
      broken.exec(sql);
    } finally {
      broken.close();
    }
    await assert.rejects(backup.restoreSqliteBackupFile(filename, f.directory), /Cadangan tidak valid/, sql);
  }
  assert.equal((await f.books.getAllBooks()).length, 1);
  assert.equal(await f.count(), 1);
  assert.equal(await f.balance(), 90000);
});

test('portability: restore rollback removes every new book, wallet, category and budget after a write failure', async (t) => {
  const f = await fixture(t);
  const backup = f.load('src/db/repositories/sqliteBackupRepo.ts');
  await f.transactions.createTransaction(f.entry());
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 50000);
  const filename = 'rollback.sqlite';
  await backup.createSqliteBackupFile(filename, f.directory);
  const source = new DatabaseSync(path.join(f.directory, filename));
  try {
    source.exec(`
      INSERT INTO categories (id, name, type, icon, color, sort_order, is_default)
      SELECT 9999, 'Kategori Baru dari Cadangan', type, icon, color, sort_order, 0 FROM categories WHERE type = 'expense' LIMIT 1;
      UPDATE transactions SET category_id = 9999;
      UPDATE budgets SET category_id = 9999;
    `);
  } finally {
    source.close();
  }
  const counts = async () => Promise.all(['books', 'wallets', 'categories', 'transactions', 'budgets'].map(async (table) => (await f.db.getFirstAsync(`SELECT COUNT(*) n FROM ${table}`)).n));
  const before = await counts();
  f.nativeDb.exec("CREATE TRIGGER fail_restore AFTER INSERT ON budgets BEGIN SELECT RAISE(ABORT, 'simulated import failure'); END;");
  await assert.rejects(backup.restoreSqliteBackupFile(filename, f.directory), /simulated import failure/);
  assert.deepEqual(await counts(), before);
  assert.equal((await f.books.getDefaultBook()).id, f.book.id);
  assert.equal(await f.balance(), 90000);
  f.nativeDb.exec('DROP TRIGGER fail_restore');
  await backup.restoreSqliteBackupFile(filename, f.directory);
  assert.equal((await f.books.getAllBooks()).length, 2);
});

test('portability: legacy categories with the same name keep separate transaction and budget relations', async (t) => {
  const f = await fixture(t);
  const backup = f.load('src/db/repositories/sqliteBackupRepo.ts');
  await f.transactions.createTransaction(f.entry());
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 50000);
  const filename = 'duplicate-category.sqlite';
  await backup.createSqliteBackupFile(filename, f.directory);
  const source = new DatabaseSync(path.join(f.directory, filename));
  try {
    source.prepare(`
      INSERT INTO categories (id, name, type, icon, color, sort_order, is_default)
      SELECT 9999, name, type, icon, color, sort_order, 0 FROM categories WHERE id = ?
    `).run(f.expense.id);
    source.exec(`
      INSERT INTO transactions (id, book_id, wallet_id, category_id, type, amount, note, date, created_at, updated_at)
      SELECT 9999, book_id, wallet_id, 9999, type, amount, note, date, created_at, updated_at FROM transactions;
      INSERT INTO budgets (id, book_id, category_id, amount, month, created_at)
      SELECT 9999, book_id, 9999, amount, month, created_at FROM budgets;
    `);
  } finally {
    source.close();
  }
  const result = await backup.restoreSqliteBackupFile(filename, f.directory);
  assert.equal(result.categoriesCreated, 1);
  const importedBook = await f.db.getFirstAsync('SELECT id FROM books WHERE id<>?', [f.book.id]);
  const imported = await f.transactions.getTransactions(importedBook.id);
  assert.equal(new Set(imported.map((transaction) => transaction.category_id)).size, 2);
  assert.equal((await f.budgets.getBudgetsWithProgress(importedBook.id, '2026-11')).length, 2);
});

test('portability: SQLite file restores 100,000 transactions in batches with exact balance and budget', async (t) => {
  const f = await fixture(t);
  const backup = f.load('src/db/repositories/sqliteBackupRepo.ts');
  const totalTransactions = 100_000;
  const filename = 'Cadangan KASKUY.sqlite';
  await f.db.runAsync(`
    WITH RECURSIVE numbers(n) AS (VALUES (1) UNION ALL SELECT n + 1 FROM numbers WHERE n < ?)
    INSERT INTO transactions (book_id, wallet_id, category_id, type, amount, note, date)
    SELECT ?, ?, ?, 'expense', 1, 'Nomor ' || n, '2026-11-24' FROM numbers
  `, [totalTransactions, f.book.id, f.wallet.id, f.expense.id]);
  await f.wallets.updateWalletBalance(f.wallet.id, 1790);
  const balance = await f.balance();
  await f.budgets.setBudget(f.book.id, f.expense.id, '2026-11', 300_000);

  await backup.createSqliteBackupFile(filename, f.directory);
  const file = fs.readFileSync(path.join(f.directory, filename));
  assert.equal(file.subarray(0, 16).toString('utf8'), 'SQLite format 3\0');
  const exported = new DatabaseSync(path.join(f.directory, filename), { readOnly: true });
  try {
    assert.deepEqual(exported.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all().map(({ name }) => name),
      ['backup_info', 'books', 'budgets', 'categories', 'transactions', 'wallets']);
  } finally {
    exported.close();
  }
  const preview = await backup.inspectSqliteBackupFile(filename, f.directory);
  assert.ok(Number.isFinite(Date.parse(preview.createdAt)));
  assert.deepEqual(preview.books.map(({ id, name }) => ({ id, name })), [{ id: f.book.id, name: f.book.name }]);
  assert.equal(preview.transactionCount, totalTransactions);
  assert.equal(preview.budgetCount, 1);

  let progress;
  const result = await backup.restoreSqliteBackupFile(filename, f.directory, (completed, total) => { progress = [completed, total]; });
  const [restored] = result.restoredBooks;
  assert.equal(result.transactions, totalTransactions);
  assert.equal(result.budgets, 1);
  assert.ok(progress[0] >= totalTransactions);
  assert.equal(progress[0], progress[1]);
  assert.equal((await f.books.getDefaultBook()).id, f.book.id);
  const restoredWallet = await f.db.getFirstAsync('SELECT id, balance FROM wallets WHERE book_id = ? AND name = ?', [restored.id, f.wallet.name]);
  assert.equal(restoredWallet.balance, balance);
  const restoredSummary = await f.db.getFirstAsync(`
    SELECT count(*) AS count, sum(amount) AS amount, min(note) AS first_note,
           sum(note = 'Nomor 100000') AS last_note
    FROM transactions WHERE book_id = ? AND wallet_id = ?`, [restored.id, restoredWallet.id]);
  assert.deepEqual(restoredSummary, { count: totalTransactions, amount: totalTransactions, first_note: 'Nomor 1', last_note: 1 });
  assert.equal((await f.budgets.getBudgetsWithProgress(restored.id, '2026-11'))[0].spent, totalTransactions);
  assert.equal(await f.balance(), balance);
});

test('portability: SQLite bytes reject bad backups and roll back a later restore batch', async (t) => {
  const f = await fixture(t);
  const backup = f.load('src/db/repositories/sqliteBackupRepo.ts');
  await f.db.runAsync(`
    WITH RECURSIVE numbers(n) AS (VALUES (1) UNION ALL SELECT n + 1 FROM numbers WHERE n < 105)
    INSERT INTO transactions (book_id, wallet_id, category_id, type, amount, note, date)
    SELECT ?, ?, ?, 'expense', 1, 'Nomor ' || n, '2026-11-24' FROM numbers
  `, [f.book.id, f.wallet.id, f.expense.id]);
  const bytes = await backup.createSqliteBackup();
  assert.equal((await backup.inspectSqliteBackup(bytes)).transactionCount, 105);
  await assert.rejects(backup.inspectSqliteBackup(new Uint8Array(100)), /Cadangan tidak valid/);
  const filename = 'cadangan-rusak.sqlite';
  const fullPath = path.join(f.directory, filename);
  fs.writeFileSync(fullPath, bytes);
  const broken = new DatabaseSync(fullPath);
  try {
    broken.exec('PRAGMA user_version = 999');
    await assert.rejects(backup.inspectSqliteBackupFile(filename, f.directory), /versi cadangan/);
    broken.exec('PRAGMA user_version = 1');
    broken.prepare('UPDATE transactions SET category_id = ? WHERE id = 1').run(f.income.id);
    await assert.rejects(backup.restoreSqliteBackupFile(filename, f.directory), /tidak cocok/);
  } finally {
    broken.close();
  }

  f.nativeDb.exec(`CREATE TRIGGER fail_sqlite_restore BEFORE INSERT ON transactions WHEN NEW.note = 'Nomor 105'
    BEGIN SELECT RAISE(ABORT, 'simulated later batch failure'); END;`);
  await assert.rejects(backup.restoreSqliteBackup(bytes), /simulated later batch failure/);
  assert.equal((await f.books.getAllBooks()).length, 1);
  assert.equal(await f.count(), 105);
  f.nativeDb.exec('DROP TRIGGER fail_sqlite_restore');
  assert.equal((await backup.restoreSqliteBackup(bytes)).transactions, 105);
});

test('sample transactions: seed once in a separate book and preserve its removal', async (t) => {
  const f = await fixture(t);
  const { createSampleTransactionsBook } = f.load('src/db/repositories/sampleTransactionsRepo.ts');
  const sameName = await f.books.createBook('Buku Contoh');

  f.nativeDb.exec(`CREATE TRIGGER fail_example_write BEFORE INSERT ON transactions WHEN NEW.note = 'Tiket bioskop'
    BEGIN SELECT RAISE(ABORT, 'simulated sample transaction failure'); END;`);
  await assert.rejects(createSampleTransactionsBook(), /simulated sample transaction failure/);
  assert.equal((await f.books.getAllBooks()).length, 2);
  assert.equal(await f.count(), 0);
  f.nativeDb.exec('DROP TRIGGER fail_example_write');

  const [created, retried] = await Promise.all([createSampleTransactionsBook(), createSampleTransactionsBook()]);
  assert.deepEqual(created, retried);
  assert.equal(created.name, 'Buku Contoh 2');
  assert.equal((await f.books.getDefaultBook()).id, f.book.id);
  assert.equal(await f.balance(), 100000);
  assert.equal((await f.transactions.getTransactions(sameName.id)).length, 0);

  const transactions = await f.transactions.getTransactions(created.id);
  const wallets = await f.wallets.getWallets(created.id);
  const today = f.load('src/lib/date.ts').getTodayDateString();
  assert.equal(transactions.length, 18);
  assert.equal(wallets.length, 3);
  assert.equal(wallets.reduce((total, wallet) => total + wallet.balance, 0), 4222900);
  assert.ok(transactions.every((transaction) => transaction.date.startsWith(today.slice(0, 7)) && transaction.date <= today));

  for (const transaction of transactions) await f.transactions.deleteTransaction(transaction.id);
  await f.books.deleteBook(created.id);
  assert.equal(await createSampleTransactionsBook(), null);
  assert.equal((await f.books.getAllBooks()).length, 2);
});

